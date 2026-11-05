import type { DetectedObject, SceneItem } from "@/lib/scene-types";
import { loadCutout, loadImageElement } from "@/lib/background-remover";
import {
  getShadowAspect,
  getShadowShiftPercent,
  itemWidthPercent,
  projectRotatedColumn,
  rotatedFootprintFactor,
  sortByZ,
  type ShadowParams,
} from "./geometry";

/**
 * Desenha a imagem com o pé centralizado em (baseX, baseY), girada em torno do eixo vertical.
 * Fatias verticais reproduzem perspective() + rotateY() do editor (cada fatia com sua escala).
 */
function drawRotated(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  baseX: number,
  baseY: number,
  w: number,
  h: number,
  deg: number,
  flipped: boolean
) {
  let source = src;
  if (flipped) {
    const m = document.createElement("canvas");
    m.width = src.width;
    m.height = src.height;
    const mctx = m.getContext("2d");
    if (mctx) {
      mctx.translate(src.width, 0);
      mctx.scale(-1, 1);
      mctx.drawImage(src, 0, 0);
      source = m;
    }
  }
  const strips = Math.max(24, Math.min(160, Math.round(w / 3)));
  const srcStrip = source.width / strips;
  for (let i = 0; i < strips; i++) {
    const x0 = -w / 2 + (w * i) / strips;
    const x1 = -w / 2 + (w * (i + 1)) / strips;
    const a = projectRotatedColumn(x0, w, deg);
    const b = projectRotatedColumn(x1, w, deg);
    const mid = projectRotatedColumn((x0 + x1) / 2, w, deg);
    const left = Math.min(a.x, b.x);
    const sw = Math.abs(b.x - a.x);
    const sh = h * mid.s;
    // +0.6 px evita frestas entre as fatias
    ctx.drawImage(source, i * srcStrip, 0, srcStrip, source.height, baseX + left, baseY - sh, sw + 0.6, sh);
  }
}

export interface RenderSceneOptions {
  roomImage: string;
  items: SceneItem[];
  cmPerPercentX: number;
  shadow: ShadowParams;
  /** maior lado do JPEG final em px (padrão 1600) */
  maxSize?: number;
  quality?: number;
  /** imagem-guia da IA: pinta os móveis substituídos (e os removidos) com cinza sólido e um X */
  markReplaced?: boolean;
  /** móveis removidos da foto (marcados como os substituídos quando markReplaced) */
  removed?: DetectedObject[];
}

/** Replica o posicionamento do editor (cover na proporção da foto) e devolve JPEG. */
export async function renderSceneToBlob(opts: RenderSceneOptions): Promise<Blob | null> {
  const { roomImage, items, cmPerPercentX, shadow } = opts;
  const room = await loadImageElement(roomImage);
  const nw = room.naturalWidth || 1200;
  const nh = room.naturalHeight || 800;
  const k = Math.min(1, (opts.maxSize ?? 1600) / Math.max(nw, nh));
  const W = Math.round(nw * k);
  const H = Math.round(nh * k);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(room, 0, 0, W, H);

  if (opts.markReplaced) {
    const boxes = [...items.flatMap((it) => (it.replaces ? [it.replaces.box] : [])), ...(opts.removed ?? []).map((o) => o.box)];
    for (const b of boxes) {
      const bx = (b.x / 100) * W;
      const by = (b.y / 100) * H;
      const bw = (b.w / 100) * W;
      const bh = (b.h / 100) * H;
      ctx.fillStyle = "#8c8c8c";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = Math.max(3, W * 0.004);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + bw, by + bh);
      ctx.moveTo(bx + bw, by);
      ctx.lineTo(bx, by + bh);
      ctx.stroke();
    }
  }

  const ordered = sortByZ(items);
  const cutouts = await Promise.all(ordered.map((it) => loadCutout(it.product.imageUrl)));

  ordered.forEach((item, idx) => {
    const cutout = cutouts[idx];
    if (!cutout) return;
    const wPct = itemWidthPercent(item, cmPerPercentX);
    const w = (wPct / 100) * W;
    const h = w * cutout.aspect;
    const baseX = (item.x / 100) * W;
    const baseY = (item.y / 100) * H;

    // Sombra elíptica com gradiente radial (mesma geometria do editor)
    const sw = w * 1.05 * rotatedFootprintFactor(item.product, item.rotation ?? 0);
    const sh = sw / getShadowAspect(item.product);
    const scx = baseX + (getShadowShiftPercent(shadow.angleDeg, wPct) / 100) * W;
    const scy = baseY - sh * 0.05; // translate(-50%, -55%) => centro 5% acima da base
    ctx.save();
    ctx.translate(scx, scy);
    ctx.scale(1, sh / sw);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, sw / 2);
    g.addColorStop(0, `rgba(0,0,0,${0.62 * shadow.opacity})`);
    g.addColorStop(0.5, `rgba(0,0,0,${0.3 * shadow.opacity})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, sw / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Produto recortado (pé centralizado na base)
    const rot = item.rotation ?? 0;
    if (rot) {
      drawRotated(ctx, cutout.canvas, baseX, baseY, w, h, rot, item.flipped);
    } else {
      ctx.save();
      ctx.translate(baseX, baseY - h);
      if (item.flipped) ctx.scale(-1, 1);
      ctx.drawImage(cutout.canvas, -w / 2, 0, w, h);
      ctx.restore();
    }
  });

  // Faixa discreta
  const text = "Lojas Benoit • Simulador Casa Viva";
  const fontPx = Math.max(12, Math.round(W * 0.016));
  ctx.font = `bold ${fontPx}px sans-serif`;
  const padX = fontPx * 0.8;
  const barH = fontPx * 2;
  const barW = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = "rgba(238,49,53,0.92)";
  ctx.fillRect(0, H - barH - fontPx * 0.8, barW, barH);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, padX, H - barH / 2 - fontPx * 0.8);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", opts.quality ?? 0.9));
}

/** Foto gerada por IA com a faixa visível "Imagem ilustrativa gerada por IA" gravada na imagem. */
export async function renderAiPhotoWithBadge(imageDataUrl: string): Promise<Blob | null> {
  const img = await loadImageElement(imageDataUrl);
  const nw = img.naturalWidth || 1280;
  const nh = img.naturalHeight || 960;
  const k = Math.min(1, 2048 / Math.max(nw, nh));
  const W = Math.round(nw * k);
  const H = Math.round(nh * k);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, W, H);

  const text = "Imagem ilustrativa gerada por IA — confira o produto oficial";
  const fontPx = Math.max(12, Math.round(W * 0.018));
  ctx.font = `bold ${fontPx}px sans-serif`;
  const barH = fontPx * 2.2;
  ctx.fillStyle = "rgba(15,23,42,0.88)";
  ctx.fillRect(0, H - barH, W, barH);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, W / 2, H - barH / 2, W - fontPx * 2);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
}
