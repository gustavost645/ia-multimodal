/**
 * Geometria de caixas em % da imagem. Sem dependências: pode ser usada no navegador e no servidor.
 */
import type { DetectedObject, PercentBox } from "@/lib/scene-types";

/** Interseção sobre união (0 = não se tocam, 1 = idênticas). */
export function boxIoU(a: PercentBox, b: PercentBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

/** Mesmo móvel em duas detecções: caixas que se sobrepõem (IoU > 0,5). */
export function sameDetectedObject(a: DetectedObject, b: DetectedObject): boolean {
  return boxIoU(a.box, b.box) > 0.5;
}
