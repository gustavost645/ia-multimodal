/**
 * Recorte de fundo de fotos de produto (fundo de estúdio liso).
 * O fundo é removido por flood fill a partir das bordas: só o que é parecido com a cor de
 * fundo E está conectado à borda some. Produtos brancos sobre fundo branco mantêm o miolo.
 * Depois do recorte, as margens transparentes são cortadas (bounding box do conteúdo).
 */
import { toProxiedImageUrl } from "@/lib/remote-image";

export interface RemoveBgOptions {
  tolerance?: number; // 0 a 100, padrão ~26
  feather?: number; // suavização da borda (em % de distância de cor), padrão 2
  targetColor?: { r: number; g: number; b: number }; // padrão: cor amostrada nas bordas
  maxSize?: number; // maior lado de trabalho em px, padrão 900
  trim?: boolean; // corta margens transparentes, padrão true
}

export interface Cutout {
  canvas: HTMLCanvasElement;
  dataUrl: string;
  width: number;
  height: number;
  /** altura / largura do conteúdo (já sem margens) */
  aspect: number;
  /** false quando o recorte falhou/foi descartado e a imagem original foi usada */
  cutOut: boolean;
}

function drawToCanvas(img: HTMLImageElement, maxSize: number): HTMLCanvasElement {
  const nw = img.naturalWidth || img.width || 800;
  const nh = img.naturalHeight || img.height || 600;
  const k = Math.min(1, maxSize / Math.max(nw, nh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(nw * k));
  canvas.height = Math.max(1, Math.round(nh * k));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function sampleBackground(data: Uint8ClampedArray, w: number, h: number) {
  // Mediana por canal de pontos ao longo das bordas (robusta a um objeto encostado na borda)
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 16) return;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  const stepX = Math.max(1, Math.floor(w / 24));
  const stepY = Math.max(1, Math.floor(h / 24));
  for (let x = 0; x < w; x += stepX) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += stepY) {
    push(0, y);
    push(w - 1, y);
  }
  if (!rs.length) return null;
  const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
  return { r: med(rs), g: med(gs), b: med(bs) };
}

/** Remove o fundo conectado às bordas e devolve um canvas (já cortado nas margens). */
export function removeBackgroundToCanvas(
  imgElement: HTMLImageElement,
  options: RemoveBgOptions = {}
): { canvas: HTMLCanvasElement; cutOut: boolean } {
  const tolerance = options.tolerance ?? 26;
  const feather = options.feather ?? 2;
  const maxSize = options.maxSize ?? 900;
  const canvas = drawToCanvas(imgElement, maxSize);
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const bg = options.targetColor ?? sampleBackground(data, w, h);
  if (!bg) return { canvas, cutOut: false };

  const tolDist = (tolerance / 100) * 255;
  const featherDist = (feather / 100) * 255;
  const dist = (i: number) => {
    if (data[i + 3] < 16) return -1; // já transparente
    const dr = data[i] - bg.r;
    const dg = data[i + 1] - bg.g;
    const db = data[i + 2] - bg.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  const isBg = (px: number) => {
    const d = dist(px * 4);
    return d < 0 || d < tolDist;
  };

  // Flood fill (4-vizinhos) a partir de todos os pixels de borda que parecem fundo
  const removed = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const seed = (px: number) => {
    if (!removed[px] && isBg(px)) {
      removed[px] = 1;
      stack[sp++] = px;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (sp > 0) {
    const px = stack[--sp];
    const x = px % w;
    if (x > 0) seed(px - 1);
    if (x < w - 1) seed(px + 1);
    if (px >= w) seed(px - w);
    if (px < w * (h - 1)) seed(px + w);
  }

  let removedCount = 0;
  for (let px = 0; px < removed.length; px++) {
    if (removed[px]) {
      data[px * 4 + 3] = 0;
      removedCount++;
    }
  }

  // Se quase tudo (ou quase nada) foi removido, o recorte não é confiável
  const ratio = removedCount / (w * h);
  if (ratio > 0.97 || ratio < 0.02) {
    return { canvas: drawToCanvas(imgElement, maxSize), cutOut: false };
  }

  // Borda suave: pixels remanescentes encostados no fundo removido e ainda próximos da cor de fundo
  if (featherDist > 0) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = y * w + x;
        if (removed[px]) continue;
        const touches =
          (x > 0 && removed[px - 1]) ||
          (x < w - 1 && removed[px + 1]) ||
          (y > 0 && removed[px - w]) ||
          (y < h - 1 && removed[px + w]);
        if (!touches) continue;
        const d = dist(px * 4);
        if (d >= 0 && d < tolDist + featherDist) {
          data[px * 4 + 3] = Math.round(((d - tolDist) / featherDist) * 255);
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  return { canvas: options.trim === false ? canvas : trimTransparent(canvas), cutOut: true };
}

/** Corta as margens transparentes (bounding box do conteúdo, alpha > threshold). */
export function trimTransparent(canvas: HTMLCanvasElement, threshold = 8): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return canvas;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw === w && ch === h) return canvas;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

/** Compatível com o uso antigo: devolve data URL PNG do recorte. */
export function removeBackgroundFromImage(imgElement: HTMLImageElement, options: RemoveBgOptions = {}): string {
  try {
    return removeBackgroundToCanvas(imgElement, options).canvas.toDataURL("image/png");
  } catch {
    return imgElement.src;
  }
}

// ---------- Carregamento + cache por URL ----------

const cutoutCache = new Map<string, Promise<Cutout | null>>();

/** Carrega uma imagem pelo proxy (mesma origem), segura para desenhar em canvas. */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem"));
    img.src = toProxiedImageUrl(src);
  });
}

function toCutout(canvas: HTMLCanvasElement, cutOut: boolean): Cutout {
  return {
    canvas,
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    aspect: canvas.height / canvas.width,
    cutOut,
  };
}

/**
 * Carrega a imagem do produto (via proxy), recorta o fundo e corta as margens.
 * O resultado é cacheado por URL. Devolve null se a imagem não carregar.
 */
export function loadCutout(url: string): Promise<Cutout | null> {
  const cached = cutoutCache.get(url);
  if (cached) return cached;
  const promise = (async () => {
    let img: HTMLImageElement;
    try {
      img = await loadImageElement(url);
    } catch {
      return null;
    }
    try {
      const { canvas, cutOut } = removeBackgroundToCanvas(img);
      return toCutout(canvas, cutOut);
    } catch {
      try {
        return toCutout(drawToCanvas(img, 900), false);
      } catch {
        return null;
      }
    }
  })();
  cutoutCache.set(url, promise);
  promise.then((c) => {
    if (!c) cutoutCache.delete(url); // permite nova tentativa depois
  });
  return promise;
}
