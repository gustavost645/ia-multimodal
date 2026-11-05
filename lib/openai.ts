/**
 * Cliente mínimo da API REST da OpenAI (sem SDK), usado como reserva do Gemini.
 * Só deve rodar no servidor.
 */
import type { InlineImagePart } from "@/lib/gemini";

const API = "https://api.openai.com/v1";

export const getOpenAIKey = () => process.env.CHATGPT_API_KEY || process.env.OPENAI_API_KEY || "";
export const hasOpenAI = () => getOpenAIKey().length > 0;

export const OPENAI_MODEL = () => process.env.OPENAI_MODEL || "gpt-5-mini";
export const OPENAI_IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

export type OpenAIErrorKind = "billing" | "quota" | "auth" | "error";

export class OpenAIError extends Error {
  kind: OpenAIErrorKind;
  /** Segundos até poder tentar de novo (quota) */
  retryAfterSec?: number;
  constructor(kind: OpenAIErrorKind, message: string, retryAfterSec?: number) {
    super(message);
    this.name = "OpenAIError";
    this.kind = kind;
    this.retryAfterSec = retryAfterSec;
  }
}

// Sem créditos: lembrado por alguns minutos para não chamar a API à toa
let billingUntil = 0;
export const isOpenAIBillingKnown = () => billingUntil > Date.now();

async function toError(res: Response): Promise<OpenAIError> {
  let message = `OpenAI respondeu ${res.status}`;
  let code = "";
  let type = "";
  try {
    const j = (await res.json()) as { error?: { message?: string; code?: string; type?: string } };
    message = j.error?.message || message;
    code = j.error?.code || "";
    type = j.error?.type || "";
  } catch {
    /* corpo não era JSON */
  }
  if (res.status === 401) return new OpenAIError("auth", "Chave da OpenAI inválida.");
  if (res.status === 429 || res.status === 402) {
    if (/no credits|insufficient_quota|billing|exceeded your current quota/i.test(`${message} ${code} ${type}`)) {
      billingUntil = Date.now() + 10 * 60_000;
      return new OpenAIError("billing", "A conta da OpenAI está sem créditos.");
    }
    const retry = Number(res.headers.get("retry-after"));
    return new OpenAIError("quota", "Limite de uso da OpenAI atingido.", retry > 0 ? retry : 60);
  }
  return new OpenAIError("error", message.slice(0, 200));
}

async function post(path: string, init: RequestInit, timeoutMs = 110_000): Promise<Response> {
  if (isOpenAIBillingKnown()) throw new OpenAIError("billing", "A conta da OpenAI está sem créditos.");
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${getOpenAIKey()}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new OpenAIError("error", `Falha de rede com a OpenAI: ${(e as Error).message}`);
  }
  if (!res.ok) throw await toError(res);
  return res;
}

const dataUrl = (img: InlineImagePart) => `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`;

/** Resposta estruturada (JSON Schema estrito) via Responses API. Devolve o texto JSON. */
export async function openaiJson(opts: {
  system?: string;
  text: string;
  images: InlineImagePart[];
  schema: Record<string, unknown>;
  schemaName: string;
}): Promise<{ text: string; model: string }> {
  const model = OPENAI_MODEL();
  const res = await post("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      input: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        {
          role: "user",
          content: [
            { type: "input_text", text: opts.text },
            ...opts.images.map((img) => ({ type: "input_image", image_url: dataUrl(img) })),
          ],
        },
      ],
      text: { format: { type: "json_schema", name: opts.schemaName, schema: opts.schema, strict: true } },
    }),
  });
  const j = (await res.json()) as {
    output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
  };
  const content = (j.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  const text = content.find((c) => c.type === "output_text")?.text;
  if (!text) throw new OpenAIError("error", content.find((c) => c.refusal)?.refusal || "A OpenAI não devolveu texto.");
  return { text, model };
}

/** Escolhe o tamanho suportado pelo gpt-image mais próximo da proporção da foto. */
export function openaiImageSize(ratio?: number): "1536x1024" | "1024x1536" | "1024x1024" {
  if (!ratio) return "1024x1024";
  return ratio > 1.15 ? "1536x1024" : ratio < 0.87 ? "1024x1536" : "1024x1024";
}

/** Edita/compõe imagens (várias imagens de entrada). Devolve data URL. */
export async function openaiEditImage(opts: {
  prompt: string;
  images: { mimeType: string; data: string }[];
  size?: "1536x1024" | "1024x1536" | "1024x1024";
  /** Tempo máximo desta chamada (orçamento total da geração) */
  timeoutMs?: number;
}): Promise<{ image: string; model: string }> {
  const model = OPENAI_IMAGE_MODEL();
  const build = (fidelity: boolean) => {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", opts.prompt);
    form.set("quality", "medium");
    form.set("size", opts.size ?? "1024x1024");
    // Mantém o produto fiel à foto de referência (suportado pelos gpt-image-1 e 1.5)
    if (fidelity) form.set("input_fidelity", "high");
    opts.images.forEach((img, i) => {
      const ext = img.mimeType.includes("png") ? "png" : img.mimeType.includes("webp") ? "webp" : "jpg";
      form.append("image[]", new Blob([Buffer.from(img.data, "base64")], { type: img.mimeType }), `image${i + 1}.${ext}`);
    });
    return form;
  };
  const started = Date.now();
  const budget = () => Math.max(10_000, (opts.timeoutMs ?? 110_000) - (Date.now() - started));
  const wantsFidelity = /^gpt-image-1(\.5)?$/.test(model);
  let res: Response;
  try {
    res = await post("/images/edits", { method: "POST", body: build(wantsFidelity) }, budget());
  } catch (e) {
    // Modelo sem suporte a input_fidelity: tenta de novo sem ele
    if (wantsFidelity && e instanceof OpenAIError && e.kind === "error" && /input_fidelity/i.test(e.message)) {
      res = await post("/images/edits", { method: "POST", body: build(false) }, budget());
    } else throw e;
  }
  const j = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new OpenAIError("error", "A OpenAI não devolveu uma imagem.");
  return { image: `data:image/png;base64,${b64}`, model };
}
