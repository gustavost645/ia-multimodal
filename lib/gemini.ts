/**
 * Utilitários do Gemini compartilhados pelas rotas /api/room/*. Só deve rodar no servidor.
 */
import { GoogleGenAI } from "@google/genai";
import type { NextRequest } from "next/server";
import { fetchRemoteImage } from "@/lib/remote-image";

export type GeminiRoute = "direct" | "aihubmix";

/** Cliente Gemini: direto (GEMINI_API_KEY) ou via AIHubMix (mesmos modelos, cobrados lá). */
export function getGenAI(via: GeminiRoute = "direct") {
  if (via === "aihubmix") {
    const base = (process.env.AIHUBMIX_BASE_URL || "https://aihubmix.com").replace(/[/]+$/, "");
    return new GoogleGenAI({
      apiKey: process.env.AIHUBMIX_API_KEY || "",
      httpOptions: { baseUrl: `${base}/gemini` },
    });
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

export const hasGeminiDirect = () => (process.env.GEMINI_API_KEY || "").length > 0;

const splitList = (v?: string) =>
  (v || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

/** Modelos de texto/visão: principal + reservas (configuráveis via .env). */
export const GEMINI_MODELS = [process.env.GEMINI_MODEL || "gemini-3.8-flash", ...splitList(process.env.GEMINI_FALLBACK_MODELS)];

/** Modelos de geração de imagem: principal + reservas. */
export const GEMINI_IMAGE_MODELS = [
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
  ...splitList(process.env.GEMINI_IMAGE_FALLBACK_MODELS ?? "gemini-2.5-flash-image"),
];

export function errorMessage(error: unknown) {
  return String((error as { message?: string })?.message ?? error);
}

export function isRetryable(error: unknown) {
  return /\b(429|500|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(errorMessage(error));
}

/** Cota do plano gratuito sem valor para o modelo (limite 0): só faturamento resolve. */
export function isBillingRequired(error: unknown) {
  const msg = errorMessage(error);
  return /limit:\s*0\b|"quotaValue":\s*"0"|balance is insufficient|recharge your account|Aihubmix_api_error/i.test(msg);
}

// Modelos com cota esgotada ficam bloqueados até a liberação informada pela API
const blockedUntil = new Map<string, number>();

export function quotaRetryMs(error: unknown): number | undefined {
  const msg = errorMessage(error);
  if (!/RESOURCE_EXHAUSTED|exceeded your current quota/i.test(msg)) return undefined;
  const seconds = Number(msg.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/)?.[1]);
  // Sem prazo informado: cota por minuto → 1 min; cota diária → 1 h
  return seconds > 0 ? seconds * 1000 : /per day/i.test(msg) ? 3600_000 : 60_000;
}

export class AllModelsUnavailableError extends Error {
  /** Minutos até a liberação do primeiro modelo */
  minutes: number;
  constructor(message: string, minutes: number) {
    super(message);
    this.minutes = minutes;
  }
}
export class RateLimitError extends Error {}

type GenerateParams = Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">;

export async function generateWithRetry(
  ai: GoogleGenAI,
  params: GenerateParams,
  models: string[] = GEMINI_MODELS,
  scope: GeminiRoute = "direct"
) {
  // Pausas por cota separadas por rota (direto / AIHubMix)
  const bk = (m: string) => `${scope}:${m}`;
  const available = models.filter((m) => (blockedUntil.get(bk(m)) ?? 0) <= Date.now());
  if (available.length === 0) {
    const next = Math.min(...models.map((m) => blockedUntil.get(bk(m)) ?? 0));
    const minutes = Math.ceil((next - Date.now()) / 60_000);
    throw new AllModelsUnavailableError(
      `Cota do Gemini esgotada em todos os modelos configurados; liberação em ~${minutes} min.`,
      minutes
    );
  }

  let lastError: unknown;
  for (const model of available) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await ai.models.generateContent({ ...params, model });
        return { response, model };
      } catch (error) {
        lastError = error;
        // Sem cota no plano gratuito: tentar de novo não adianta; passa ao próximo modelo
        if (isBillingRequired(error)) break;
        // Modelo inexistente ou sem acesso: tenta o próximo
        if (/\b404\b|NOT_FOUND|not found/i.test(errorMessage(error))) break;
        const waitMs = quotaRetryMs(error);
        if (waitMs !== undefined && waitMs > 30_000) {
          blockedUntil.set(bk(model), Date.now() + waitMs);
          console.warn(`Gemini ${model}: cota esgotada, pausado por ~${Math.ceil(waitMs / 60_000)} min. Tentando o próximo modelo.`);
          break;
        }
        if (!isRetryable(error)) throw error;
        console.warn(`Gemini ${model}: indisponível no momento (tentativa ${attempt + 1}/3).`);
        await new Promise((r) => setTimeout(r, waitMs ?? 1000 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

export type InlineImagePart = { inlineData: { mimeType: string; data: string } };

/** Aceita data URL (base64) ou URL de host permitido (baixada com segurança). */
export async function loadImagePart(src: unknown): Promise<InlineImagePart | null> {
  if (typeof src !== "string" || !src) return null;

  const dataUrl = src.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (dataUrl) return { inlineData: { mimeType: dataUrl[1], data: dataUrl[2] } };

  try {
    const { data, contentType } = await fetchRemoteImage(src);
    return { inlineData: { mimeType: contentType, data: Buffer.from(data).toString("base64") } };
  } catch (error) {
    console.warn(`Imagem não carregada (${src.slice(0, 120)}): ${(error as Error).message}`);
    return null;
  }
}

/** IP do cliente: x-real-ip, senão o último item de x-forwarded-for (adicionado pelo proxy confiável). */
export function getClientIp(req: NextRequest) {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean);
  return fwd?.length ? fwd[fwd.length - 1] : "local";
}

/** Limitador em memória por chave. consume() devolve minutos de espera se excedeu, senão null. */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    limit,
    consume(key: string): number | null {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 60_000));
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return null;
    },
  };
}

/** Cache simples com limite de entradas (descarta a mais antiga). */
export function createCache<T>(limit: number) {
  const map = new Map<string, T>();
  return {
    get: (k: string) => map.get(k),
    set(k: string, v: T) {
      if (map.size >= limit) map.delete(map.keys().next().value!);
      map.set(k, v);
    },
  };
}

export class BodyTooLargeError extends Error {}

/** Lê o JSON do corpo com limite de bytes, mesmo sem content-length (chunked). */
export async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw new BodyTooLargeError();
  if (!req.body) throw new SyntaxError("corpo vazio");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}
