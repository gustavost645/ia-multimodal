/**
 * Análise de qualidade da foto do cômodo, 100% no navegador.
 * Verifica resolução, brilho médio, nitidez (variância do Laplaciano em
 * versão reduzida) e orientação retrato.
 */

export type PhotoIssueCode =
  | "low-resolution"
  | "too-dark"
  | "too-bright"
  | "blurry"
  | "portrait";

export interface PhotoIssue {
  code: PhotoIssueCode;
  /** Mensagem amigável em português */
  message: string;
}

export interface PhotoQualityReport {
  width: number;
  height: number;
  /** Brilho médio 0-255 (null se não foi possível ler os pixels) */
  brightness: number | null;
  /** Variância do Laplaciano (maior = mais nítida) */
  sharpness: number | null;
  issues: PhotoIssue[];
}

export const PHOTO_QUALITY_THRESHOLDS = {
  minLongSide: 1000,
  minShortSide: 640,
  tooDark: 60,
  tooBright: 205,
  blurry: 25,
  analysisWidth: 256,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem"));
    img.src = src;
  });
}

/** Retorna null se a imagem não puder ser carregada. */
export async function analyzePhotoQuality(src: string): Promise<PhotoQualityReport | null> {
  if (typeof window === "undefined") return null;
  let img: HTMLImageElement;
  try {
    img = await loadImage(src);
  } catch {
    return null;
  }

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const T = PHOTO_QUALITY_THRESHOLDS;
  const issues: PhotoIssue[] = [];

  if (Math.max(width, height) < T.minLongSide || Math.min(width, height) < T.minShortSide) {
    issues.push({
      code: "low-resolution",
      message: `A foto tem resolução baixa (${width}×${height}). Fotos maiores deixam a simulação mais realista.`,
    });
  }
  if (height > width * 1.05) {
    issues.push({
      code: "portrait",
      message:
        "A foto está na vertical. Com o celular na horizontal, você enquadra mais a parede e a medição fica mais precisa.",
    });
  }

  let brightness: number | null = null;
  let sharpness: number | null = null;
  try {
    const w = T.analysisWidth;
    const h = Math.max(8, Math.round((height / width) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const gray = new Float32Array(w * h);
      let sum = 0;
      for (let i = 0; i < w * h; i++) {
        const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        gray[i] = g;
        sum += g;
      }
      brightness = sum / (w * h);

      // Laplaciano 3x3 e variância
      let lSum = 0;
      let lSq = 0;
      let n = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const lap = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
          lSum += lap;
          lSq += lap * lap;
          n++;
        }
      }
      if (n > 0) {
        const mean = lSum / n;
        sharpness = lSq / n - mean * mean;
      }
    }
  } catch {
    // Canvas "contaminado" (CORS) ou indisponível: segue só com resolução/orientação.
  }

  if (brightness !== null) {
    if (brightness < T.tooDark) {
      issues.push({
        code: "too-dark",
        message: "A foto está escura. Acenda as luzes ou abra as cortinas e tente de novo.",
      });
    } else if (brightness > T.tooBright) {
      issues.push({
        code: "too-bright",
        message: "A foto está muito clara/estourada. Evite apontar a câmera para a janela ou para a luz.",
      });
    }
  }
  if (sharpness !== null && sharpness < T.blurry) {
    issues.push({
      code: "blurry",
      message: "A foto parece desfocada ou tremida. Segure o celular firme e toque na tela para focar.",
    });
  }

  return { width, height, brightness, sharpness, issues };
}
