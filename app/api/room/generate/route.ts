import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  BodyTooLargeError,
  createCache,
  createRateLimiter,
  errorMessage,
  getClientIp,
  loadImagePart,
  readJsonWithLimit,
  type InlineImagePart,
} from "@/lib/gemini";
import {
  billingMessage,
  ImageGenerationError,
  type CropBox,
  buildGeneratePrompt,
  generateImage,
  imageProviderAvailable,
} from "@/lib/ai-provider";
import type { AiProvider, GenerateRequest, GenerateResponse } from "@/lib/scene-types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BODY_BYTES = 15 * 1024 * 1024;
const MAX_GUIDE_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS = 6;
const MAX_REMOVED = 12;
const limiter = createRateLimiter(6, 60 * 60 * 1000);
const cache = createCache<{ image: string; model: string; provider: AiProvider; cropBox?: CropBox }>(20);


const reply = (body: GenerateResponse & { provider?: AiProvider; cropBox?: CropBox }, status = 200) => NextResponse.json(body, { status });
const invalid = (error: string, status = 400) => reply({ success: false, error, reason: "invalid" }, status);

const SUPPORTED_RATIOS = [
  ["1:1", 1], ["2:3", 2 / 3], ["3:2", 3 / 2], ["3:4", 3 / 4], ["4:3", 4 / 3], ["9:16", 9 / 16], ["16:9", 16 / 9], ["21:9", 21 / 9],
] as const;

/** Lê largura/altura de PNG ou JPEG para escolher o aspectRatio mais próximo. */
function imageRatio(base64: string): { label: string; value: number } | undefined {
  try {
    const buf = Buffer.from(base64, "base64");
    let w = 0;
    let h = 0;
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      w = buf.readUInt32BE(16);
      h = buf.readUInt32BE(20);
    } else if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          h = buf.readUInt16BE(i + 5);
          w = buf.readUInt16BE(i + 7);
          break;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (!w || !h) return undefined;
    const r = w / h;
    const best = SUPPORTED_RATIOS.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a));
    return { label: best[0], value: r };
  } catch {
    return undefined;
  }
}

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/** Descreve o giro do produto para o modelo de imagem (positivo = frente voltada para a direita da foto). */
function rotationText(deg?: number): string {
  const d = Math.round(deg ?? 0);
  if (Math.abs(d) < 5) return " Orientation: facing the camera (front view).";
  const side = d > 0 ? "right" : "left";
  const near = d > 0 ? "left" : "right";
  return ` Orientation: rotated about ${Math.abs(d)} degrees around its vertical axis so its front faces toward the ${side} side of the image (three-quarter view: its ${near} end is closer to the camera and that side panel is visible). Render it truly turned in 3D at this angle, aligned with the room's floor perspective, not as a flat front-view photo.`;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let body: Partial<GenerateRequest> | null;
  try {
    body = (await readJsonWithLimit(req, MAX_BODY_BYTES)) as Partial<GenerateRequest> | null;
  } catch (e) {
    if (e instanceof BodyTooLargeError) return invalid("Os dados enviados são grandes demais (máx. 15 MB).", 413);
    return invalid("Corpo da requisição inválido.");
  }

  // Validação
  if (!body || typeof body.roomImage !== "string" || !body.roomImage) return invalid("Foto do cômodo não fornecida.");
  const guide = typeof body.guideImage === "string" ? body.guideImage.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!guide) return invalid("A imagem-guia do editor é obrigatória (data URL JPEG ou PNG).");
  if (Math.floor((guide[2].length * 3) / 4) > MAX_GUIDE_BYTES) return invalid("A imagem-guia passa de 4 MB.", 413);
  if (!Array.isArray(body.items)) return invalid("Nenhum produto na cena.");
  if (body.removed !== undefined && (!Array.isArray(body.removed) || body.removed.length > MAX_REMOVED)) {
    return invalid(`Remova no máximo ${MAX_REMOVED} móveis por foto.`);
  }
  const removed = body.removed ?? [];
  // Sem produto novo, só faz sentido gerar se houver móveis a remover
  if (body.items.length === 0 && removed.length === 0) return invalid("Nenhum produto na cena.");
  if (body.items.length > MAX_ITEMS) return invalid(`Use no máximo ${MAX_ITEMS} produtos por foto.`);
  const clean = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 120);
  const inRange = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
  const validBox = (b: unknown): b is { x: number; y: number; w: number; h: number } => {
    const v = b as { x?: unknown; y?: unknown; w?: unknown; h?: unknown } | null;
    return !!v && inRange(v.x) && inRange(v.y) && inRange(v.w) && inRange(v.h) && (v.w as number) > 0 && (v.h as number) > 0;
  };
  for (const r of removed) {
    if (!r || typeof r.label !== "string" || !validBox(r.box)) return invalid("Dados do móvel a remover inválidos.");
    r.label = clean(r.label);
  }
  const items = body.items;
  for (const it of items) {
    const nums = [it?.x, it?.y, it?.widthPct, it?.heightPct];
    if (!it || typeof it.productName !== "string" || typeof it.productImageUrl !== "string" || nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      return invalid("Dados de produto inválidos.");
    }
    it.productName = clean(it.productName);
    const rot = Number(it.rotation ?? 0);
    it.rotation = Number.isFinite(rot) ? Math.max(-60, Math.min(60, Math.round(rot))) : 0;
    if (it.replaces) {
      const b = it.replaces.box;
      if (
        typeof it.replaces.label !== "string" || !b ||
        !inRange(b.x) || !inRange(b.y) || !inRange(b.w) || !inRange(b.h) || b.w <= 0 || b.h <= 0
      ) {
        return invalid("Dados do móvel a substituir inválidos.");
      }
      it.replaces = { ...it.replaces, label: clean(it.replaces.label) };
    }
  }

  const key = createHash("sha1").update(JSON.stringify(body)).digest("hex");
  const cached = cache.get(key);
  if (cached) return reply({ success: true, image: cached.image, model: cached.model, provider: cached.provider, cropBox: cached.cropBox });

  if (!imageProviderAvailable()) return reply({ success: false, reason: "billing", error: billingMessage() }, 402);

  try {
    const [roomPart, ...productParts] = await Promise.all([
      loadImagePart(body.roomImage),
      ...items.map((it) => loadImagePart(it.productImageUrl)),
    ]);
    if (!roomPart) return invalid("Não foi possível carregar a foto do cômodo.");

    // O limite por IP só é consumido depois de validar e carregar as imagens
    const wait = limiter.consume(getClientIp(req));
    if (wait !== null) {
      return reply(
        { success: false, reason: "rate_limit", error: `Limite de fotos realistas por hora atingido. Tente novamente em ~${wait} min.` },
        429
      );
    }

    const parts: Array<{ text: string } | InlineImagePart> = [
      { text: "IMAGE 1 — ORIGINAL ROOM PHOTO (the scene to edit):" },
      roomPart,
      { text: "IMAGE 2 — EDITOR GUIDE (a rough composite showing the exact position and size of each product; use it only as a layout reference, do NOT copy its look):" },
      { inlineData: { mimeType: `image/${guide[1]}`, data: guide[2] } },
    ];
    const lines: string[] = [];
    const labels: string[] = [
      "IMAGE 1 — ORIGINAL ROOM PHOTO (the scene to edit).",
      "IMAGE 2 — EDITOR GUIDE (layout reference only, do NOT copy its look).",
    ];
    const images: InlineImagePart[] = [roomPart, { inlineData: { mimeType: `image/${guide[1]}`, data: guide[2] } }];
    let n = 3;
    items.forEach((it, i) => {
      const part = productParts[i];
      const left = it.x - it.widthPct / 2;
      const top = it.y - it.heightPct;
      let line = `- "${it.productName}": base center at x=${pct(it.x)}, y=${pct(it.y)}; bounding box left=${pct(left)}, top=${pct(top)}, width=${pct(it.widthPct)}, height=${pct(it.heightPct)} of the image${it.flipped ? "; mirrored horizontally in the guide" : ""}.${rotationText(it.rotation)}`;
      if (part) {
        parts.push({ text: `IMAGE ${n} — OFFICIAL PHOTO OF PRODUCT "${it.productName}":` }, part);
        labels.push(`IMAGE ${n} — OFFICIAL PHOTO OF PRODUCT "${it.productName}".`);
        images.push(part);
        line += ` Reference photo: IMAGE ${n}.`;
        n++;
      } else {
        line += " (No reference photo available: follow the product name and the editor guide.)";
      }
      if (it.replaces) {
        const b = it.replaces.box;
        line += ` REPLACES the existing "${it.replaces.label}" located at box left=${pct(b.x)}, top=${pct(b.y)}, width=${pct(b.w)}, height=${pct(b.h)}: remove it completely.`;
      }
      lines.push(line);
    });

    const removedLines = removed.map((r) => {
      const b = r.box;
      return `- "${r.label}" at box left=${pct(b.x)}, top=${pct(b.y)}, width=${pct(b.w)}, height=${pct(b.h)}.`;
    });
    const prompt = buildGeneratePrompt(lines, removedLines);
    parts.push({ text: prompt });

    const ratio = imageRatio(roomPart.inlineData.data);
    const result = await generateImage({
      geminiParts: parts,
      openaiPreamble: ["Input images, in order:", ...labels].join(String.fromCharCode(10)),
      prompt,
      images,
      aspectRatio: ratio?.label,
      ratio: ratio?.value,
      startedAt,
    });
    cache.set(key, { image: result.image, model: result.model, provider: result.provider, cropBox: result.cropBox });
    return reply({ success: true, image: result.image, model: result.model, provider: result.provider, cropBox: result.cropBox });
  } catch (error) {
    console.warn(`Geração de imagem falhou: ${errorMessage(error).split(String.fromCharCode(10))[0].slice(0, 200)}`);
    if (error instanceof ImageGenerationError) {
      if (error.reason === "billing") return reply({ success: false, reason: "billing", error: error.message }, 402);
      if (error.reason === "quota") return reply({ success: false, reason: "quota", error: error.message }, 429);
      return reply({ success: false, reason: "error", error: error.message }, 502);
    }
    return reply({ success: false, reason: "error", error: "Não foi possível gerar a foto realista agora. Tente novamente em instantes." }, 502);
  }
}
