/**
 * OpenRouter (agregador de modelos, API compatível com a OpenAI). Só deve rodar no servidor.
 * - Visão/JSON: modelos gratuitos (":free"), tentados em ordem.
 * - Imagem: modelos de geração de imagem (ex.: Gemini Image) via chat/completions; exigem créditos.
 */
import type { InlineImagePart } from "@/lib/gemini";
import { extractJson } from "@/lib/aihubmix";

const API = "https://openrouter.ai/api/v1";

const splitList = (v?: string) =>
  (v || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

export const getOpenRouterKey = () => process.env.OPENROUTER_API_KEY || "";
export const hasOpenRouter = () => getOpenRouterKey().length > 0;

/** Modelos de visão, em ordem de preferência (os ":free" não consomem créditos; limite diário de requisições). */
export const OPENROUTER_MODELS = () => {
  const list = splitList(process.env.OPENROUTER_MODELS);
  return list.length
    ? list
    : ["nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free"];
};

/** Modelos de geração/edição de imagem (pagos), em ordem de preferência. */
export const OPENROUTER_IMAGE_MODELS = () => {
  const list = splitList(process.env.OPENROUTER_IMAGE_MODELS);
  return list.length ? list : ["google/gemini-3.1-flash-image", "google/gemini-2.5-flash-image"];
};

export type OpenRouterErrorKind = "billing" | "quota" | "auth" | "error";

export class OpenRouterError extends Error {
  kind: OpenRouterErrorKind;
  retryAfterSec?: number;
  constructor(kind: OpenRouterErrorKind, message: string, retryAfterSec?: number) {
    super(message);
    this.name = "OpenRouterError";
    this.kind = kind;
    this.retryAfterSec = retryAfterSec;
  }
}

// Sem créditos (imagem) ou limite diário dos modelos gratuitos (texto): lembrados por um tempo
let billingUntil = 0;
let freeQuotaUntil = 0;
export const isOpenRouterBillingKnown = () => billingUntil > Date.now();
export const isOpenRouterFreeQuotaKnown = () => freeQuotaUntil > Date.now();

function headers() {
  return {
    Authorization: `Bearer ${getOpenRouterKey()}`,
    "Content-Type": "application/json",
    // Opcionais: identificam o app no painel/ranking do OpenRouter
    "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
    "X-Title": "Benoit Casa Viva",
  };
}

type ChatContent = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type Part = { text: string } | InlineImagePart;

/** Converte as partes (texto/imagem) no conteúdo do chat/completions, mantendo a ordem. */
export function partsToChatContent(parts: Part[]): ChatContent[] {
  return parts.map((p) =>
    "text" in p
      ? { type: "text", text: p.text }
      : { type: "image_url", image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }
  );
}

async function toError(res: Response, raw: string): Promise<OpenRouterError> {
  let message = `OpenRouter respondeu ${res.status}`;
  try {
    const j = JSON.parse(raw) as { error?: { message?: string; metadata?: { raw?: string } } };
    message = [j.error?.message, j.error?.metadata?.raw].filter(Boolean).join(" - ") || message;
  } catch {
    /* corpo não era JSON */
  }
  if (res.status === 401) return new OpenRouterError("auth", "Chave do OpenRouter inválida.");
  if (res.status === 402) {
    billingUntil = Date.now() + 10 * 60_000;
    return new OpenRouterError("billing", "A conta do OpenRouter está sem créditos.");
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    return new OpenRouterError("quota", `Limite de uso do OpenRouter atingido: ${message.slice(0, 160)}`, retry > 0 ? retry : 60);
  }
  return new OpenRouterError("error", message.slice(0, 200));
}

async function chat(body: Record<string, unknown>, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new OpenRouterError("error", `Falha de rede com o OpenRouter: ${(e as Error).message}`);
  }
  const raw = await res.text();
  if (!res.ok) throw await toError(res, raw);
  try {
    return JSON.parse(raw) as {
      error?: { message?: string; code?: number };
      choices?: { message?: { content?: unknown; images?: { image_url?: { url?: string } }[] } }[];
    };
  } catch {
    throw new OpenRouterError("error", "Resposta inesperada do OpenRouter.");
  }
}

const contentText = (c: unknown) =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p as { text?: string })?.text ?? "").join("") : "";

/** Limite diário dos modelos gratuitos (50/dia sem créditos)? */
const isFreeDailyLimit = (e: OpenRouterError) => e.kind === "quota" && /free-models-per-day|per day|daily/i.test(e.message);

/**
 * Resposta JSON com imagens. Tenta cada modelo de OPENROUTER_MODELS até obter JSON válido.
 * Com `schema`, pede saída estruturada (json_schema estrito); sem ele, só json_object (formato vem no prompt).
 */
export async function openrouterJson(opts: {
  parts: Part[];
  schema?: Record<string, unknown>;
  schemaName?: string;
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  if (isOpenRouterFreeQuotaKnown()) throw new OpenRouterError("quota", "Limite diário dos modelos gratuitos do OpenRouter atingido.");
  const budgetMs = opts.timeoutMs ?? 100_000;
  const started = Date.now();
  let lastError: unknown;
  for (const model of OPENROUTER_MODELS()) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 8_000) break;
    try {
      const j = await chat(
        {
          model,
          // Modelos com raciocínio gastam muitos tokens antes de responder: limite baixo = resposta vazia
          max_tokens: 6000,
          response_format: opts.schema
            ? { type: "json_schema", json_schema: { name: opts.schemaName || "result", strict: true, schema: opts.schema } }
            : { type: "json_object" },
          messages: [{ role: "user", content: partsToChatContent(opts.parts) }],
        },
        Math.min(60_000, remaining)
      );
      if (j.error) throw new OpenRouterError("error", j.error.message || "Erro do OpenRouter.");
      const text = contentText(j.choices?.[0]?.message?.content);
      if (!text.trim()) throw new OpenRouterError("error", "Resposta vazia.");
      extractJson(text); // valida: lança se não houver JSON utilizável
      return { text, model };
    } catch (e) {
      lastError = e;
      if (e instanceof OpenRouterError) {
        if (e.kind === "auth" || e.kind === "billing") throw e;
        if (isFreeDailyLimit(e)) {
          freeQuotaUntil = Date.now() + 60 * 60_000;
          throw e;
        }
      }
      console.warn(`OpenRouter (${model}) falhou: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  throw lastError instanceof Error ? lastError : new OpenRouterError("error", "Nenhum modelo do OpenRouter respondeu.");
}

/** Gera/edita imagem a partir de texto + imagens (ex.: Gemini Image). Devolve data URL. */
export async function openrouterImage(opts: {
  parts: Part[];
  aspectRatio?: string;
  timeoutMs?: number;
}): Promise<{ image: string; model: string }> {
  if (isOpenRouterBillingKnown()) throw new OpenRouterError("billing", "A conta do OpenRouter está sem créditos.");
  const budgetMs = opts.timeoutMs ?? 110_000;
  const started = Date.now();
  let lastError: unknown;
  for (const model of OPENROUTER_IMAGE_MODELS()) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 10_000) break;
    try {
      const j = await chat(
        {
          model,
          modalities: ["image", "text"],
          ...(opts.aspectRatio ? { image_config: { aspect_ratio: opts.aspectRatio } } : {}),
          messages: [{ role: "user", content: partsToChatContent(opts.parts) }],
        },
        remaining
      );
      if (j.error) throw new OpenRouterError("error", j.error.message || "Erro do OpenRouter.");
      const url = j.choices?.[0]?.message?.images?.find((i) => i.image_url?.url)?.image_url?.url;
      if (!url) throw new OpenRouterError("error", "O OpenRouter não devolveu uma imagem.");
      return { image: url, model };
    } catch (e) {
      lastError = e;
      if (e instanceof OpenRouterError && (e.kind === "auth" || e.kind === "billing")) throw e;
      console.warn(`OpenRouter imagem (${model}) falhou: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  throw lastError instanceof Error ? lastError : new OpenRouterError("error", "Nenhum modelo de imagem do OpenRouter respondeu.");
}
