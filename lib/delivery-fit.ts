/**
 * "Passa pela porta?" — funções puras que conferem se a caixa de entrega de um produto
 * passa por porta, corredor em L e elevador. Todas as medidas em centímetros.
 *
 * Importante: use o VÃO LIVRE (largura útil com a porta aberta, ~5–7 cm menor que a nominal).
 * Os resultados são estimativas; "justo" = folga menor que 3 cm.
 */
import type { BenoitProduct } from "@/data/benoit-catalog";

export type FitStatus = "passa" | "justo" | "não passa";

export const TIGHT_MARGIN_CM = 3;

export interface Box {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  /** true quando a caixa foi estimada a partir do produto (dimensões + 5 cm) */
  estimated: boolean;
}

export interface FitResult {
  obstacle: "porta" | "corredor" | "elevador";
  status: FitStatus;
  /** Folga em cm (negativa = falta espaço) */
  marginCm: number;
  explanation: string;
}

export interface DoorInput {
  widthCm: number;
  heightCm: number;
}
export interface HallInput {
  /** Largura do corredor antes da curva e depois dela (se só uma, repete) */
  widthCm: number;
  widthAfterCm?: number;
  /** Altura máxima para carregar a caixa (pé-direito/porta). Padrão 250 cm. */
  maxHeightCm?: number;
}
export interface ElevatorInput {
  widthCm: number;
  depthCm: number;
  heightCm: number;
  /** Vão da porta do elevador (opcional; se ausente, usa a largura × altura da cabine) */
  doorWidthCm?: number;
}

export const EST_PACKAGE_PADDING_CM = 5;

/** Caixa real quando existe; senão, medidas do produto + 5 cm (marcada como estimada). */
export function boxOf(p: BenoitProduct): Box {
  const pk = p.packageDimensions;
  if (pk) return { widthCm: pk.widthCm, heightCm: pk.heightCm, depthCm: pk.depthCm, estimated: false };
  const pad = EST_PACKAGE_PADDING_CM;
  return {
    widthCm: p.dimensions.widthCm + pad,
    heightCm: p.dimensions.heightCm + pad,
    depthCm: p.dimensions.depthCm + pad,
    estimated: true,
  };
}

const sortedDims = (b: Box) => [b.widthCm, b.heightCm, b.depthCm].sort((a, c) => c - a); // desc

function statusOf(margin: number): FitStatus {
  if (margin < 0) return "não passa";
  return margin < TIGHT_MARGIN_CM ? "justo" : "passa";
}

const fmt = (n: number) => `${Math.round(n * 10) / 10}`.replace(".", ",");

/**
 * Maior folga ao passar um retângulo p×q (p ≥ q) por um vão W×H, girando-o num ângulo θ ∈ [0°, 90°]:
 * largura projetada = p·cosθ + q·sinθ, altura projetada = p·sinθ + q·cosθ.
 * Retorna a maior folga mínima (min(W − proj_w, H − proj_h)) entre todos os ângulos testados.
 */
export function rectThroughOpening(p: number, q: number, W: number, H: number): number {
  let best = -Infinity;
  for (let deg = 0; deg <= 90; deg += 0.5) {
    const t = (deg * Math.PI) / 180;
    const pw = p * Math.cos(t) + q * Math.sin(t);
    const ph = p * Math.sin(t) + q * Math.cos(t);
    best = Math.max(best, Math.min(W - pw, H - ph));
  }
  return best;
}

/**
 * Folga para passar a caixa por uma abertura W×H. A caixa pode ser virada: a seção que atravessa
 * a abertura é formada pelas duas menores dimensões (p ≥ q); o comprimento maior vai "atrás".
 * Também vale inclinar a seção (varredura de ângulo) — usamos a melhor das duas.
 */
export function openingMargin(box: Box, W: number, H: number): number {
  const [, p, q] = sortedDims(box);
  const simple = Math.min(W - p, H - q); // seção p×q na posição natural
  const swapped = Math.min(W - q, H - p); // seção girada 90°
  return Math.max(simple, swapped, rectThroughOpening(p, q, W, H));
}

export function checkDoor(box: Box, door: DoorInput): FitResult {
  const [, p, q] = sortedDims(box);
  const margin = openingMargin(box, door.widthCm, door.heightCm);
  const status = statusOf(margin);
  const sec = `${fmt(p)} × ${fmt(q)} cm`;
  const explanation =
    status === "não passa"
      ? `A menor seção da caixa (${sec}) não cabe no vão de ${fmt(door.widthCm)} × ${fmt(door.heightCm)} cm (faltam ${fmt(-margin)} cm).`
      : status === "justo"
        ? `Passa com folga de apenas ${fmt(margin)} cm (seção ${sec}). Requer cuidado e a caixa deitada.`
        : `Passa com folga de ${fmt(margin)} cm (seção ${sec}).`;
  return { obstacle: "porta", status, marginCm: Math.round(margin * 10) / 10, explanation };
}

/**
 * Corredor com curva em L (larguras a e b). Fórmula prática (aprox. para objeto retangular
 * de largura w e comprimento L carregado na horizontal): L_max = ((a−w)^(2/3) + (b−w)^(2/3))^(3/2).
 * Confiança baixa; resultado é estimativa. A caixa passa se o comprimento L ≤ L_max, com w = menor
 * dimensão da caixa. Se a largura do corredor for menor que w, não passa.
 * (Altura de carregamento é livre — o corredor não limita altura.)
 */
export function maxLengthAroundCorner(a: number, b: number, w: number): number {
  if (a <= w || b <= w) return 0;
  return Math.pow(Math.pow(a - w, 2 / 3) + Math.pow(b - w, 2 / 3), 1.5);
}

export function checkHall(box: Box, hall: HallInput): FitResult {
  const a = hall.widthCm;
  const b = hall.widthAfterCm ?? hall.widthCm;
  const maxH = hall.maxHeightCm ?? 250;
  const d = [box.widthCm, box.heightCm, box.depthCm];

  // Testa as 3 escolhas de dimensão vertical (limitada ao pé-direito/porta); a base x × y faz a curva.
  let best = { margin: -Infinity, vertical: 0, x: 0, y: 0 };
  for (let i = 0; i < 3; i++) {
    const vertical = d[i];
    if (vertical > maxH) continue;
    const [x, y] = d.filter((_, j) => j !== i);
    const margin = Math.max(
      Math.min(a - y, b - x), // faz a curva sem girar (base encaixa nas duas larguras)
      Math.min(a - x, b - y),
      maxLengthAroundCorner(a, b, Math.min(x, y)) - Math.max(x, y) // gira na curva
    );
    if (margin > best.margin) best = { margin, vertical, x, y };
  }
  if (best.margin === -Infinity) {
    return { obstacle: "corredor", status: "não passa", marginCm: -1, explanation: `A caixa é mais alta que o limite de ${fmt(maxH)} cm para carregar pelo corredor.` };
  }

  const status = statusOf(best.margin);
  const pose =
    best.vertical === box.heightCm ? "em pé" : best.vertical === box.widthCm || best.vertical === box.depthCm ? "deitada de lado" : "deitada";
  const base = `${fmt(Math.max(best.x, best.y))} × ${fmt(Math.min(best.x, best.y))} cm`;
  const explanation =
    status === "não passa"
      ? `Na curva em L nem a melhor posição (${pose}, base ${base}) funciona: faltam ~${fmt(-best.margin)} cm (estimativa).`
      : status === "justo"
        ? `Faz a curva por pouco, carregada ${pose} (base ${base}), folga ~${fmt(best.margin)} cm (estimativa).`
        : `Faz a curva em L carregada ${pose} (base ${base}), folga ~${fmt(best.margin)} cm (estimativa).`;
  return { obstacle: "corredor", status, marginCm: Math.round(best.margin * 10) / 10, explanation };
}

/**
 * Elevador (cabine L × P × A). Cabe em pé/deitado se a caixa couber na cabine em alguma orientação;
 * senão, inclinada na diagonal do plano profundidade × altura (e também largura × altura).
 * Se `doorWidthCm` for informado, a seção da caixa também precisa passar pela porta da cabine.
 */
export function checkElevator(box: Box, el: ElevatorInput): FitResult {
  const dims = sortedDims(box); // desc
  const cab = [el.widthCm, el.depthCm, el.heightCm].sort((a, b) => b - a);

  // Orientações axiais: maior com maior, etc.
  const axial = Math.min(cab[0] - dims[0], cab[1] - dims[1], cab[2] - dims[2]);

  // Inclinada: maior dimensão na diagonal de um plano vertical (profundidade×altura ou largura×altura);
  // as outras duas dimensões precisam caber na terceira direção e na altura restante (conservador).
  // No plano (horizontal × altura) ficam a maior dimensão e a menor; a do meio vai na direção restante.
  const diagonal = (horizontal: number, other: number) =>
    Math.min(rectThroughOpening(dims[0], dims[2], horizontal, el.heightCm), other - dims[1]);
  const diagA = diagonal(el.depthCm, el.widthCm);
  const diagB = diagonal(el.widthCm, el.depthCm);

  let margin = Math.max(axial, diagA, diagB);

  if (el.doorWidthCm) {
    const doorMargin = openingMargin(box, el.doorWidthCm, el.heightCm);
    margin = Math.min(margin, doorMargin);
  }

  const status = statusOf(margin);
  const explanation =
    status === "não passa"
      ? `A caixa (${dims.map(fmt).join(" × ")} cm) não cabe na cabine de ${cab.map(fmt).join(" × ")} cm nem inclinada${el.doorWidthCm ? " / pela porta do elevador" : ""}.`
      : status === "justo"
        ? `Cabe na cabine com folga de apenas ${fmt(margin)} cm; pode exigir inclinar a caixa.`
        : `Cabe na cabine com folga de ${fmt(margin)} cm.`;
  return { obstacle: "elevador", status, marginCm: Math.round(margin * 10) / 10, explanation };
}

export interface ProductFit {
  product: BenoitProduct;
  box: Box;
  results: FitResult[];
  /** Pior status entre os obstáculos informados */
  overall: FitStatus;
}

const RANK: Record<FitStatus, number> = { passa: 0, justo: 1, "não passa": 2 };

/** Confere um produto contra todos os obstáculos informados. */
export function checkProductFit(
  product: BenoitProduct,
  obstacles: { door: DoorInput; hall?: HallInput; elevator?: ElevatorInput }
): ProductFit {
  const box = boxOf(product);
  const results: FitResult[] = [checkDoor(box, obstacles.door)];
  if (obstacles.hall) {
    results.push(checkHall(box, { maxHeightCm: Math.max(obstacles.door.heightCm, 200), ...obstacles.hall }));
  }
  if (obstacles.elevator) results.push(checkElevator(box, obstacles.elevator));
  const overall = results.reduce<FitStatus>((w, r) => (RANK[r.status] > RANK[w] ? r.status : w), "passa");
  return { product, box, results, overall };
}
