import type { BenoitProduct } from "@/data/benoit-catalog";
import type { PercentBox, PhotoCalibration, RoomMeasurements, SceneItem } from "@/lib/scene-types";

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2;
/** Achatamento vertical da profundidade (perspectiva de piso). */
export const FLOOR_FLATTEN = 0.35;

export interface ShadowParams {
  /** 0–1 */
  opacity: number;
  /** ângulo da sombra em graus (desloca a sombra para o lado) */
  angleDeg: number;
}

export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

/** cm correspondentes a 1% da largura da imagem. */
export function getCmPerPercent(calibration: PhotoCalibration | undefined, measurements: RoomMeasurements) {
  if (calibration && calibration.cmPerPercentX > 0) {
    return { cmPerPercentX: calibration.cmPerPercentX, approximate: calibration.source === "ai-estimate" };
  }
  const coveredCm = Math.max((measurements.widthCm || 0) * 1.6, 350);
  return { cmPerPercentX: coveredCm / 100, approximate: true };
}

/** Largura do item em % da largura da imagem. */
export function itemWidthPercent(item: Pick<SceneItem, "product" | "scale">, cmPerPercentX: number): number {
  const widthCm = item.product.dimensions.widthCm || 100;
  return (widthCm / cmPerPercentX) * item.scale;
}

export interface UsageArea {
  depthCm: number;
  label: string;
}

/** Espaço necessário à frente da base: porta aberta/reclinado ou circulação. */
export function getUsageArea(product: BenoitProduct): UsageArea {
  const open = product.dimensions.openDepthCm ?? 0;
  const circulation = product.clearanceRequirements?.minFrontCm ?? 0;
  const needed = product.dimensions.depthCm + circulation;
  if (open > 0 && open >= needed) {
    const verb = product.category === "estofados" ? "Reclinado" : "Porta aberta";
    return { depthCm: open, label: `${verb}: ${Math.round(open)} cm` };
  }
  return { depthCm: needed, label: `Circulação: ${Math.round(circulation)} cm` };
}

export function sortByZ(items: SceneItem[]): SceneItem[] {
  return [...items].sort((a, b) => a.z - b.z);
}

export function newUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Proporção largura/altura da elipse de sombra (largura do produto × profundidade achatada). */
export function getShadowAspect(product: BenoitProduct): number {
  const widthCm = product.dimensions.widthCm || 100;
  const depthCm = product.dimensions.depthCm || 60;
  return widthCm / Math.max(10, depthCm * FLOOR_FLATTEN * 1.2);
}

/** Deslocamento horizontal da sombra, em % da largura da cena. */
export function getShadowShiftPercent(angleDeg: number, widthPct: number): number {
  return (Math.max(-45, Math.min(45, angleDeg)) / 45) * 0.08 * widthPct;
}

/**
 * Escala inicial para um produto que substitui um móvel da foto.
 * Sem calibração: faz a largura do item ≈ largura da caixa detectada (limitada a MIN/MAX_SCALE).
 * Com calibração: 1 (a medida real manda).
 */
export function fitScaleToBox(
  product: BenoitProduct,
  box: PercentBox,
  calibration: PhotoCalibration | undefined,
  measurements: RoomMeasurements
): number {
  if (calibration && calibration.cmPerPercentX > 0 && calibration.source !== "ai-estimate") return 1;
  const { cmPerPercentX } = getCmPerPercent(calibration, measurements);
  const widthPct = (product.dimensions.widthCm || 100) / cmPerPercentX;
  if (widthPct <= 0 || box.w <= 0) return 1;
  return clampScale(box.w / widthPct);
}

/** Assinatura estável da cena (produtos, posições, escala, espelho, ordem, substituições). */
export function sceneSignature(roomImage: string, items: SceneItem[], cmPerPercentX: number): string {
  const parts = sortByZ(items).map((i) =>
    [i.product.id, i.x.toFixed(1), i.y.toFixed(1), i.scale.toFixed(2), i.flipped ? 1 : 0, Math.round(i.rotation ?? 0), i.replaces?.id ?? ""].join(":")
  );
  return `${roomImage.length}:${roomImage.slice(-40)}|${cmPerPercentX.toFixed(3)}|${parts.join("|")}`;
}

/** Giro máximo (graus) em torno do eixo vertical. */
export const MAX_ROTATION = 60;
export const clampRotation = (deg: number) => Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, Math.round(deg)));

/** Distância da câmera usada na perspectiva, em múltiplos da largura do item (editor e exportação usam a mesma). */
export const PERSPECTIVE_FACTOR = 2.5;

/** Transformação CSS do produto girado (o elemento pai precisa de container-type: inline-size). */
export function itemCssTransform(item: Pick<SceneItem, "rotation" | "flipped">): string | undefined {
  const parts: string[] = [];
  const rot = item.rotation ?? 0;
  if (rot) parts.push(`perspective(${PERSPECTIVE_FACTOR * 100}cqw)`, `rotateY(${rot}deg)`);
  if (item.flipped) parts.push("scaleX(-1)");
  return parts.length ? parts.join(" ") : undefined;
}

/**
 * Projeção do giro: para a coluna x (px, a partir do centro da base, -w/2..w/2) devolve a posição projetada
 * e o fator de escala vertical, igual a perspective() + rotateY() com origem no centro da base.
 */
export function projectRotatedColumn(x: number, w: number, deg: number): { x: number; s: number } {
  const t = (deg * Math.PI) / 180;
  const p = PERSPECTIVE_FACTOR * w;
  const s = p / (p + x * Math.sin(t));
  return { x: x * Math.cos(t) * s, s };
}

/** Largura aparente da pegada no chão de um item girado, relativa à largura de frente (para a sombra). */
export function rotatedFootprintFactor(product: BenoitProduct, deg: number): number {
  if (!deg) return 1;
  const t = (Math.abs(deg) * Math.PI) / 180;
  const w = product.dimensions.widthCm || 100;
  const d = product.dimensions.depthCm || w * 0.4;
  return Math.cos(t) + (d / w) * Math.sin(t);
}
