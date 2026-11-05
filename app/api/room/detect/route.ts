import { Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FREE_DETECT_SPEC } from "@/lib/detection-free";
import { DETECT_JSON_SCHEMA, generateJson } from "@/lib/ai-provider";
import {
  AllModelsUnavailableError,
  BodyTooLargeError,
  readJsonWithLimit,
  RateLimitError,
  createCache,
  createRateLimiter,
  getClientIp,
  loadImagePart,
} from "@/lib/gemini";
import { DETECT_INSTRUCTIONS, detectedObjectSchema, toDetectedObjects } from "@/lib/detection";
import type { DetectResponse, DetectedObject } from "@/lib/scene-types";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const limiter = createRateLimiter(20, 60 * 60 * 1000);
const cache = createCache<{ objects: DetectedObject[]; approximate: boolean }>(100);

const PROMPT = `Você analisa a fotografia de um cômodo para o simulador "Benoit Casa Viva" das Lojas Benoit.
${DETECT_INSTRUCTIONS}`;

const fallback = (reason: string, status = 200) =>
  NextResponse.json<DetectResponse>({ success: true, objects: [], fallbackReason: reason }, { status });

export async function POST(req: NextRequest) {
  try {
    let body = null as { roomImage?: unknown } | null;
    try {
      body = (await readJsonWithLimit(req, MAX_BODY_BYTES)) as typeof body;
    } catch (e) {
      if (e instanceof BodyTooLargeError) {
        return NextResponse.json({ success: false, objects: [], fallbackReason: "Imagem grande demais (máx. 12 MB)." }, { status: 413 });
      }
    }
    const roomImage = body?.roomImage;
    if (typeof roomImage !== "string" || !roomImage) {
      return NextResponse.json({ success: false, objects: [], fallbackReason: "Imagem do cômodo não fornecida." }, { status: 400 });
    }

    const key = createHash("sha1").update(roomImage).digest("hex");
    const cached = cache.get(key);
    if (cached) return NextResponse.json<DetectResponse & { detectionApproximate: boolean }>({ success: true, objects: cached.objects, detectionApproximate: cached.approximate });

    const roomPart = await loadImagePart(roomImage);
    if (!roomPart) throw new Error("não foi possível carregar a foto do cômodo");

    const wait = limiter.consume(getClientIp(req));
    if (wait !== null) {
      throw new RateLimitError(`Limite de detecções por hora atingido. Tente novamente em ~${wait} min.`);
    }

    const { text, approximate, provider, model } = await generateJson({
      parts: [roomPart, { text: PROMPT }],
      schema: DETECT_JSON_SCHEMA,
      schemaName: "detected_objects",
      free: FREE_DETECT_SPEC,
      geminiParams: {
      contents: { parts: [roomPart, { text: PROMPT }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            objects: { type: Type.ARRAY, items: detectedObjectSchema },
          },
          required: ["objects"],
        },
      },
      },
    });

    const parsed = JSON.parse(text || "{}") as { objects?: unknown };
    const objects = toDetectedObjects(parsed.objects);
    // As caixas vindas da OpenAI são aproximadas (ela não é treinada para localização como o Gemini)
        cache.set(key, { objects, approximate });
    return NextResponse.json<DetectResponse & { detectionApproximate: boolean; provider?: string; model?: string }>({ success: true, objects, detectionApproximate: approximate, provider, model });
  } catch (error) {
    const reason =
      error instanceof AllModelsUnavailableError || error instanceof RateLimitError
        ? error.message
        : `Falha na detecção com IA: ${String((error as Error)?.message ?? error).split("\n")[0].slice(0, 200)}`;
    console.warn(reason);
    return fallback(reason, error instanceof RateLimitError ? 429 : 200);
  }
}
