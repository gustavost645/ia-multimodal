import type { BenoitProduct } from "@/data/benoit-catalog";
import type { RoomMeasurements } from "@/lib/scene-types";

export type FitStatus = "optimal" | "tight" | "exceeds";

export interface FitResult {
  status: FitStatus;
  /** Folga em cm por eixo (negativo = o produto ultrapassa o espaço) */
  marginsCm: { width: number; height: number; depth: number };
  summary: string;
}

/** Folga mínima (cm) para considerar que o produto cabe com sobra. */
export const OPTIMAL_MARGIN_CM = 15;

type ProductDims = Pick<BenoitProduct, "dimensions">;

/** Compara as medidas do produto (usando a profundidade aberta, se houver) com o espaço disponível. */
export function evaluateFit(product: ProductDims, measurements: RoomMeasurements): FitResult {
  const d = product.dimensions;
  const depthNeeded = d.openDepthCm && d.openDepthCm > d.depthCm ? d.openDepthCm : d.depthCm;
  const r = (n: number) => Math.round(n * 10) / 10;
  const marginsCm = {
    width: r(measurements.widthCm - d.widthCm),
    height: r(measurements.heightCm - d.heightCm),
    depth: r(measurements.depthCm - depthNeeded),
  };

  const min = Math.min(marginsCm.width, marginsCm.height, marginsCm.depth);
  const status: FitStatus = min < 0 ? "exceeds" : min <= OPTIMAL_MARGIN_CM ? "tight" : "optimal";

  const labels: [string, number][] = [
    ["largura", marginsCm.width],
    ["altura", marginsCm.height],
    ["profundidade", marginsCm.depth],
  ];
  let summary: string;
  if (status === "exceeds") {
    const over = labels.filter(([, m]) => m < 0).map(([n, m]) => `${n} (${Math.abs(m)} cm a mais)`);
    summary = `Não cabe: ultrapassa o espaço em ${over.join(", ")}.`;
  } else {
    const [tightName, tightMargin] = labels.reduce((a, b) => (b[1] < a[1] ? b : a));
    summary =
      status === "tight"
        ? `Cabe justo: sobram apenas ${tightMargin} cm (${tightName}).`
        : `Cabe com folga: a menor sobra é de ${tightMargin} cm (${tightName}).`;
  }
  if (depthNeeded !== d.depthCm && status !== "exceeds") {
    summary += ` Considera ${depthNeeded} cm de profundidade com o produto aberto.`;
  }
  return { status, marginsCm, summary };
}

/** "Cabe" = ideal ou justo. */
export const fitsSpace = (status: FitStatus) => status !== "exceeds";
