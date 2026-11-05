/**
 * Orquestra os provedores de IA.
 * Texto/visão: Gemini direto -> Gemini via AIHubMix -> OpenAI -> modelos gratuitos do OpenRouter -> modelo gratuito da AIHubMix.
 * Imagem: Gemini direto -> Gemini via AIHubMix -> OpenRouter (Gemini Image) -> OpenAI.
 */
import {
  AllModelsUnavailableError,
  GEMINI_IMAGE_MODELS,
  GEMINI_MODELS,
  generateWithRetry,
  getGenAI,
  hasGeminiDirect,
  isBillingRequired,
  quotaRetryMs,
  errorMessage,
  type InlineImagePart,
} from "@/lib/gemini";
import { OpenAIError, hasOpenAI, isOpenAIBillingKnown, openaiEditImage, openaiImageSize, openaiJson } from "@/lib/openai";
import {
  AihubmixError,
  aihubmixFreeVision,
  extractJson,
  hasAihubmix,
  isAihubmixBalanceError,
  isAihubmixBillingKnown,
  markAihubmixBilling,
} from "@/lib/aihubmix";
import {
  OpenRouterError,
  hasOpenRouter,
  isOpenRouterBillingKnown,
  isOpenRouterFreeQuotaKnown,
  openrouterImage,
  openrouterJson,
} from "@/lib/openrouter";
import type { AiProvider } from "@/lib/scene-types";

export type Provider = AiProvider;

/** Recorte (em % da imagem gerada) que devolve a proporção da foto original. */
export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
const NL = String.fromCharCode(10);
const firstLine = (e: unknown) => errorMessage(e).split(NL)[0].slice(0, 160);

type GeminiParams = Parameters<typeof generateWithRetry>[1];
type Part = { text: string } | InlineImagePart;

/** Junta as partes (texto/imagem, em ordem) no formato da OpenAI / chat completions. */
export function partsToOpenAI(parts: Part[]) {
  const text = parts.filter((p): p is { text: string } => "text" in p).map((p) => p.text).join(NL);
  const images = parts.filter((p): p is InlineImagePart => "inlineData" in p);
  return { text, images };
}

/** Como usar o modelo gratuito (sem schema garantido): instruções de formato + normalização da saída. */
export interface FreeSpec {
  instructions: string;
  normalize: (parsed: unknown) => unknown;
}

function markIfBalance(e: unknown) {
  if (isBillingRequired(e) || isAihubmixBalanceError(errorMessage(e))) markAihubmixBilling();
}

/**
 * Resposta JSON estruturada, tentando os provedores em ordem. Se todos falharem, relança o primeiro erro
 * (normalmente o do Gemini direto). "approximate" = caixas de localização pouco confiáveis (OpenAI / gratuito).
 */
export async function generateJson(opts: {
  geminiParams: GeminiParams;
  parts: Part[];
  schema: Record<string, unknown>;
  schemaName: string;
  free?: FreeSpec;
}): Promise<{ text: string; provider: Provider; model: string; approximate: boolean }> {
  let firstError: unknown;
  const fail = (label: string, e: unknown) => {
    firstError ??= e;
    console.warn(label + " indisponível: " + firstLine(e));
  };

  if (hasGeminiDirect()) {
    try {
      const { response, model } = await generateWithRetry(getGenAI("direct"), opts.geminiParams);
      return { text: response.text || "{}", provider: "gemini", model, approximate: false };
    } catch (e) {
      fail("Gemini", e);
    }
  }

  if (hasAihubmix() && !isAihubmixBillingKnown()) {
    try {
      const { response, model } = await generateWithRetry(getGenAI("aihubmix"), opts.geminiParams, GEMINI_MODELS, "aihubmix");
      return { text: response.text || "{}", provider: "aihubmix", model, approximate: false };
    } catch (e) {
      markIfBalance(e);
      fail("Gemini via AIHubMix", e);
    }
  }

  if (hasOpenAI() && !isOpenAIBillingKnown()) {
    try {
      const { text, images } = partsToOpenAI(opts.parts);
      const r = await openaiJson({ text, images, schema: opts.schema, schemaName: opts.schemaName });
      return { text: r.text, provider: "openai", model: r.model, approximate: true };
    } catch (e) {
      fail("OpenAI", e);
    }
  }

  if (hasOpenRouter() && !isOpenRouterFreeQuotaKnown()) {
    try {
      // Modelos gratuitos: com FreeSpec, o formato vai no prompt e a saída é normalizada; sem ela, schema estrito
      if (opts.free) {
        const r = await openrouterJson({ parts: [...opts.parts, { text: opts.free.instructions }] });
        const normalized = opts.free.normalize(extractJson(r.text));
        return { text: JSON.stringify(normalized), provider: "openrouter", model: r.model, approximate: true };
      }
      const r = await openrouterJson({ parts: opts.parts, schema: opts.schema, schemaName: opts.schemaName });
      return { text: r.text, provider: "openrouter", model: r.model, approximate: true };
    } catch (e) {
      fail("OpenRouter", e);
    }
  }

  if (hasAihubmix() && opts.free) {
    try {
      const { text, images } = partsToOpenAI(opts.parts);
      const r = await aihubmixFreeVision({ text: text + NL + NL + opts.free.instructions, images });
      const normalized = opts.free.normalize(extractJson(r.text));
      return { text: JSON.stringify(normalized), provider: "aihubmix", model: r.model, approximate: true };
    } catch (e) {
      fail("Modelo gratuito da AIHubMix", e);
    }
  }

  throw firstError ?? new Error("Nenhum provedor de IA configurado.");
}

// ---------------------------------------------------------------------------
// JSON Schemas estritos (OpenAI): todos os campos em required, additionalProperties:false
// ---------------------------------------------------------------------------

const str = { type: "string" };
const num = { type: "number" };
const strArr = { type: "array", items: str };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const DETECTED_OBJECT_JSON_SCHEMA = obj({
  label: str,
  kind: str,
  box_2d: { type: "array", items: num },
  estimated_size_cm: obj({ width: num, height: num, depth: num }),
  searchQuery: str,
  categoryPath: { type: ["string", "null"] },
});

export const DETECT_JSON_SCHEMA = obj({ objects: { type: "array", items: DETECTED_OBJECT_JSON_SCHEMA } });

export const ANALYZE_JSON_SCHEMA = obj({
  roomType: str,
  floorType: str,
  backgroundAnalysis: obj({
    lightSourceLocation: str,
    lightTemperature: str,
    floorPlaneAngleDeg: num,
    shadowDirection: str,
    shadowAngleDeg: num,
    shadowBlurPx: num,
    shadowOpacity: num,
    detectedObstacles: strArr,
  }),
  fitStatus: str,
  fitSummary: str,
  designTips: str,
  ergonomicWarnings: strArr,
  colorHarmonyScore: num,
  recommendedScaleFactor: num,
  photoQuality: obj({ ok: { type: "boolean" }, issues: strArr }),
  styleProfile: obj({
    style: str,
    dominantColors: strArr,
    suggestions: {
      type: "array",
      items: obj({ label: str, query: str, categoryPath: { type: ["string", "null"] } }),
    },
  }),
  detectedObjects: { type: "array", items: DETECTED_OBJECT_JSON_SCHEMA },
  estimatedAvailableCm: obj({ widthCm: num, heightCm: num, depthCm: num }),
});

// ---------------------------------------------------------------------------
// Foto realista
// ---------------------------------------------------------------------------

/** Prompt de geração, igual para Gemini e OpenAI. */
export function buildGeneratePrompt(productLines: string[], removedLines: string[] = []) {
  const products = productLines.length
    ? `Products to insert (positions are percentages of the image width/height, origin at the top-left):
${productLines.join("\n")}`
    : "No new products to insert.";
  const removed = removedLines.length
    ? `

Existing furniture to REMOVE completely, leaving that space empty (boxes are percentages of the image, origin at the top-left; remove the whole piece and everything resting on it, such as cushions or clothes, plus its shadow):
${removedLines.join("\n")}`
    : "";
  return `You are a professional interior photo retoucher. Produce ONE photorealistic photograph of the SAME room as IMAGE 1, with the SAME framing, camera angle and aspect ratio.

${products}${removed}

Strict rules:
1. Place each product exactly at the position and size shown in IMAGE 2 (and in the coordinates above), standing on the floor with correct perspective.
2. Preserve each product's real appearance from its reference photo: color, fabric/material, shape, proportions, number of doors, seats, drawers. Do not invent details.
3. Fully remove every piece of furniture/appliance marked as REPLACED or listed to REMOVE (use the boxes above) and rebuild the floor and wall behind it naturally, continuing the floor pattern, baseboards and wall.
4. Match the lighting of the room: coherent light direction, soft contact shadows and subtle reflections on the floor.
5. Do not add, remove or alter any other object, and do not change walls, floor, windows or decoration.
6. In IMAGE 2, solid grey areas with an X mark furniture that must be completely removed from the room; anything hidden behind a product in IMAGE 2 must not appear in the result.
7. Do not crop, zoom, rotate or change the aspect ratio or the camera framing.
8. Return only the final image.`;
}

export const BILLING_MESSAGE_GEMINI =
  "A geração de fotos realistas exige faturamento ativo na chave do Gemini (Google AI Studio -> Set up billing).";

/** Mensagem de "sem faturamento/saldo" conforme os provedores configurados. */
export function billingMessage() {
  const needs = ["faturamento no Gemini"];
  if (hasAihubmix()) needs.push("saldo na AIHubMix");
  if (hasOpenRouter()) needs.push("créditos no OpenRouter");
  if (hasOpenAI()) needs.push("créditos na OpenAI");
  if (needs.length === 1) return BILLING_MESSAGE_GEMINI;
  return "A geração de fotos realistas precisa de " + needs.join(" ou ") + ".";
}

// Faturamento do Gemini direto para imagem: lembrado por ~10 min
let geminiBillingUntil = 0;
export const isGeminiImageBillingKnown = () => geminiBillingUntil > Date.now();

export class ImageGenerationError extends Error {
  reason: "billing" | "quota" | "error";
  minutes?: number;
  constructor(reason: "billing" | "quota" | "error", message: string, minutes?: number) {
    super(message);
    this.reason = reason;
    this.minutes = minutes;
  }
}

/** Há algum provedor de imagem que vale a pena tentar agora? */
export function imageProviderAvailable() {
  return (
    (hasGeminiDirect() && !isGeminiImageBillingKnown()) ||
    (hasAihubmix() && !isAihubmixBillingKnown()) ||
    (hasOpenRouter() && !isOpenRouterBillingKnown()) ||
    (hasOpenAI() && !isOpenAIBillingKnown())
  );
}

type Failure = { kind: "billing" | "quota" | "error"; minutes?: number };

function classifyGemini(e: unknown): Failure {
  if (isBillingRequired(e)) return { kind: "billing" };
  if (e instanceof AllModelsUnavailableError) return { kind: "quota", minutes: e.minutes };
  const waitMs = quotaRetryMs(e);
  if (waitMs !== undefined || /[^0-9]429[^0-9]/.test(errorMessage(e))) {
    return { kind: "quota", minutes: Math.max(1, Math.ceil((waitMs ?? 60_000) / 60_000)) };
  }
  return { kind: "error" };
}

export async function generateImage(opts: {
  geminiParts: Part[];
  /** Texto de abertura do pedido para a OpenAI (legendas das imagens, na ordem) */
  openaiPreamble: string;
  prompt: string;
  /** Imagens na mesma ordem das legendas (foto, guia, produtos...) */
  images: InlineImagePart[];
  aspectRatio?: string;
  /** Proporção (largura/altura) da foto original */
  ratio?: number;
  /** Momento em que a requisição começou (para o orçamento total de tempo) */
  startedAt?: number;
}): Promise<{ image: string; model: string; provider: Provider; cropBox?: CropBox }> {
  const failures: Failure[] = [];
  const geminiRequest = {
    contents: { parts: opts.geminiParts },
    config: { responseModalities: ["IMAGE"], ...(opts.aspectRatio ? { imageConfig: { aspectRatio: opts.aspectRatio } } : {}) },
  };
  const readImage = (response: Awaited<ReturnType<typeof generateWithRetry>>["response"]) =>
    response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;

  // 1. Gemini direto
  if (hasGeminiDirect() && !isGeminiImageBillingKnown()) {
    try {
      const { response, model } = await generateWithRetry(getGenAI("direct"), geminiRequest, GEMINI_IMAGE_MODELS);
      const out = readImage(response);
      if (out?.data) return { image: "data:" + (out.mimeType || "image/png") + ";base64," + out.data, model, provider: "gemini" };
      failures.push({ kind: "error" });
    } catch (e) {
      console.warn("Gemini (imagem) falhou: " + firstLine(e));
      const f = classifyGemini(e);
      if (f.kind === "billing") geminiBillingUntil = Date.now() + 10 * 60_000;
      failures.push(f);
    }
  } else if (hasGeminiDirect()) {
    failures.push({ kind: "billing" });
  }

  // 2. Gemini via AIHubMix
  if (hasAihubmix() && !isAihubmixBillingKnown()) {
    try {
      const { response, model } = await generateWithRetry(getGenAI("aihubmix"), geminiRequest, GEMINI_IMAGE_MODELS, "aihubmix");
      const out = readImage(response);
      if (out?.data) return { image: "data:" + (out.mimeType || "image/png") + ";base64," + out.data, model, provider: "aihubmix" };
      failures.push({ kind: "error" });
    } catch (e) {
      console.warn("AIHubMix (imagem) falhou: " + firstLine(e));
      markIfBalance(e);
      failures.push(classifyGemini(e));
    }
  } else if (hasAihubmix()) {
    failures.push({ kind: "billing" });
  }

  // 3. OpenRouter (Gemini Image e outros; mantém a proporção pedida)
  if (hasOpenRouter() && !isOpenRouterBillingKnown()) {
    try {
      const r = await openrouterImage({
        parts: opts.geminiParts,
        aspectRatio: opts.aspectRatio,
        timeoutMs: Math.max(10_000, 115_000 - (Date.now() - (opts.startedAt ?? Date.now()))),
      });
      return { image: r.image, model: r.model, provider: "openrouter" };
    } catch (e) {
      console.warn("OpenRouter (imagem) falhou: " + firstLine(e));
      if (e instanceof OpenRouterError) {
        failures.push({
          kind: e.kind === "billing" ? "billing" : e.kind === "quota" ? "quota" : "error",
          minutes: e.retryAfterSec ? Math.ceil(e.retryAfterSec / 60) : undefined,
        });
      } else failures.push({ kind: "error" });
    }
  } else if (hasOpenRouter()) {
    failures.push({ kind: "billing" });
  }

  // 4. OpenAI
  if (hasOpenAI() && !isOpenAIBillingKnown()) {
    try {
      const size = openaiImageSize(opts.ratio);
      const [sw, sh] = size.split("x").map(Number);
      const outRatio = sw / sh;
      const differs = !!opts.ratio && Math.abs(outRatio / opts.ratio - 1) > 0.02;
      const note = differs
        ? " NOTE: the output canvas has a different aspect ratio than IMAGE 1. Keep the content of IMAGE 1 undistorted and centered, and extend the room naturally at the edges; the result will be center-cropped back to the original ratio."
        : "";
      const r = await openaiEditImage({
        prompt: [opts.openaiPreamble, "", opts.prompt + note].join(NL),
        images: opts.images.map((i) => i.inlineData),
        size,
        timeoutMs: Math.max(10_000, 115_000 - (Date.now() - (opts.startedAt ?? Date.now()))),
      });
      // O gpt-image so gera 3:2, 2:3 ou 1:1: informa o recorte central que devolve a proporcao original
      let cropBox: CropBox | undefined;
      if (differs && opts.ratio) {
        const c =
          outRatio > opts.ratio
            ? { x: ((1 - opts.ratio / outRatio) / 2) * 100, y: 0, w: (opts.ratio / outRatio) * 100, h: 100 }
            : { x: 0, y: ((1 - outRatio / opts.ratio) / 2) * 100, w: 100, h: (outRatio / opts.ratio) * 100 };
        cropBox = { x: round1(c.x), y: round1(c.y), w: round1(c.w), h: round1(c.h) };
      }
      return { image: r.image, model: r.model, provider: "openai", cropBox };
    } catch (e) {
      console.warn("OpenAI (imagem) falhou: " + firstLine(e));
      if (e instanceof OpenAIError) {
        failures.push({
          kind: e.kind === "billing" ? "billing" : e.kind === "quota" ? "quota" : "error",
          minutes: e.retryAfterSec ? Math.ceil(e.retryAfterSec / 60) : undefined,
        });
      } else failures.push({ kind: "error" });
    }
  } else if (hasOpenAI()) {
    failures.push({ kind: "billing" });
  }

  if (failures.length === 0) throw new ImageGenerationError("error", "Nenhum provedor de geração de imagem está configurado.");
  if (failures.every((f) => f.kind === "billing")) throw new ImageGenerationError("billing", billingMessage());
  const quota = failures.filter((f) => f.kind === "quota");
  if (quota.length) {
    const minutes = Math.min(...quota.map((f) => f.minutes ?? 1));
    throw new ImageGenerationError("quota", "Cota de geração de imagens esgotada; tente novamente em ~" + minutes + " min.", minutes);
  }
  throw new ImageGenerationError("error", "Não foi possível gerar a foto realista agora. Tente novamente em instantes.");
}
