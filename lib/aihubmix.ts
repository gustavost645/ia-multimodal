/**
 * AIHubMix (agregador de modelos): Gemini via SDK apontado para a AIHubMix e modelo gratuito de visão
 * pela API compatível com a OpenAI. Só deve rodar no servidor.
 */
import type { InlineImagePart } from "@/lib/gemini";

export const getAihubmixKey = () => process.env.AIHUBMIX_API_KEY || "";
export const hasAihubmix = () => getAihubmixKey().length > 0;
export const aihubmixBase = () => (process.env.AIHUBMIX_BASE_URL || "https://aihubmix.com").replace(/[/]+$/, "");
export const FREE_VISION_MODEL = () => process.env.AIHUBMIX_FREE_VISION_MODEL || "nemotron-3.5-super-vl-free";

export type AihubmixErrorKind = "billing" | "quota" | "auth" | "error";

export class AihubmixError extends Error {
  kind: AihubmixErrorKind;
  constructor(kind: AihubmixErrorKind, message: string) {
    super(message);
    this.name = "AihubmixError";
    this.kind = kind;
  }
}

// Saldo insuficiente: lembrado por alguns minutos (vale para texto e imagem pagos)
let billingUntil = 0;
export const isAihubmixBillingKnown = () => billingUntil > Date.now();
export const markAihubmixBilling = (ms = 10 * 60_000) => {
  billingUntil = Date.now() + ms;
};

/** Mensagem de erro da AIHubMix indica falta de saldo? */
// Inclui o aviso dos modelos gratuitos: contas nunca recarregadas só podem usá-los 10 vezes no total
// ("accounts that have not been recharged can only try 10 times"), devolvido com status 200 no texto.
export const isAihubmixBalanceError = (msg: string) =>
  /balance is insufficient|insufficient balance|Aihubmix_api_error|recharge your account|not been recharged|after recharging/i.test(msg);

export interface FreeVisionResult {
  text: string;
  model: string;
}

/** Modelo gratuito de visão via chat/completions. Sem schema garantido: o JSON é pedido no prompt. */
/**
 * O modelo gratuito é instável (testado: ~1 em cada 4 respostas vem vazia ou sem JSON).
 * Tenta até 3 vezes, só aceitando uma resposta que contenha JSON válido, dentro de um orçamento total de tempo.
 * Erros de saldo, chave ou limite de uso não são repetidos.
 */
export async function aihubmixFreeVision(opts: {
  text: string;
  images: InlineImagePart[];
  timeoutMs?: number;
}): Promise<FreeVisionResult> {
  const MAX_ATTEMPTS = 3;
  const budgetMs = opts.timeoutMs ?? 100_000;
  const started = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 8_000) break;
    let snippet = "";
    try {
      const result = await freeVisionOnce({ ...opts, timeoutMs: Math.min(50_000, remaining) });
      snippet = result.text.slice(0, 160).replace(/\s+/g, " ");
      extractJson(result.text); // valida: lança se não houver JSON utilizável
      return result;
    } catch (e) {
      if (snippet) console.warn(`Modelo gratuito: início da resposta inválida: ${snippet}`);
      lastError = e;
      if (e instanceof AihubmixError && e.kind !== "error") throw e; // billing / auth / quota
      console.warn(`Modelo gratuito da AIHubMix: tentativa ${attempt}/${MAX_ATTEMPTS} falhou (${(e as Error).message}).`);
    }
  }
  throw lastError instanceof Error ? lastError : new AihubmixError("error", "O modelo gratuito não respondeu.");
}

async function freeVisionOnce(opts: {
  text: string;
  images: InlineImagePart[];
  timeoutMs?: number;
}): Promise<FreeVisionResult> {
  const model = FREE_VISION_MODEL();
  let res: Response;
  try {
    res = await fetch(`${aihubmixBase()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAihubmixKey()}` },
      body: JSON.stringify({
        model,
        // O modelo gasta ~2.000 tokens raciocinando: com limite baixo a resposta vem vazia
        max_tokens: 4000,
        // Pede JSON explicitamente (testado: aceito pelo modelo e aumenta a taxa de respostas válidas)
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: opts.text },
              ...opts.images.map((img) => ({
                type: "image_url",
                image_url: { url: `data:${img.inlineData.mimeType};base64,${img.inlineData.data}` },
              })),
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    });
  } catch (e) {
    throw new AihubmixError("error", `Falha de rede com a AIHubMix: ${(e as Error).message}`);
  }
  const raw = await res.text();
  if (!res.ok) {
    if (isAihubmixBalanceError(raw)) {
      markAihubmixBilling();
      throw new AihubmixError("billing", "Saldo insuficiente na AIHubMix.");
    }
    if (res.status === 401) throw new AihubmixError("auth", "Chave da AIHubMix inválida.");
    if (res.status === 429) throw new AihubmixError("quota", "Limite de uso do modelo gratuito atingido.");
    throw new AihubmixError("error", `AIHubMix respondeu ${res.status}`);
  }
  let text = "";
  try {
    const j = JSON.parse(raw) as { choices?: { message?: { content?: unknown } }[] };
    const c = j.choices?.[0]?.message?.content;
    text = typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p as { text?: string })?.text ?? "").join("") : "";
  } catch {
    /* corpo inesperado */
  }
  if (!text.trim()) throw new AihubmixError("error", "O modelo gratuito devolveu uma resposta vazia.");
  if (isAihubmixBalanceError(text)) {
    markAihubmixBilling();
    throw new AihubmixError(
      "billing",
      "Os modelos gratuitos da AIHubMix exigem uma recarga na conta (contas sem recarga só podem usá-los 10 vezes)."
    );
  }
  return { text, model };
}

/** Extrai o objeto JSON de uma resposta de texto (remove cercas de código e texto ao redor). */
export function extractJson(text: string): unknown {
  const clean = text.replace(/```(?:json)?/gi, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AihubmixError("error", "O modelo gratuito não devolveu JSON.");
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw new AihubmixError("error", "O JSON do modelo gratuito é inválido.");
  }
}
