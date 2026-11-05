/**
 * "Borracha" de móveis 100% no navegador, sem servidor e sem chave de API:
 *  1. EdgeTAM (SAM2 leve, via transformers.js) transforma a caixa de cada móvel detectado num contorno exato;
 *  2. a máscara é fechada (pega roupas/almofadas em cima do móvel), sem buracos, e levemente expandida;
 *  3. MI-GAN apaga a área e reconstrói o fundo (parede/piso).
 * Os modelos (~50 MB) são baixados no primeiro uso e ficam no cache do navegador.
 * As bibliotecas vêm da CDN em tempo de execução (não passam pelo bundler do Next).
 * Só roda no cliente.
 */
import type { DetectedObject } from "@/lib/scene-types";
import { loadImageElement } from "@/lib/background-remover";

const ORT_VERSION = "1.30.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js";
const SEGMENT_MODEL = "onnx-community/EdgeTAM-ONNX";
const INPAINT_MODEL_URL = "https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx";
const MODEL_CACHE = "benoit-eraser-v1";

/** Maior lado da imagem processada pelos modelos (o resultado é recomposto sobre a foto original). */
const WORK_SIZE = 1280;
/** Maior lado da foto final devolvida. */
const OUTPUT_SIZE = 2048;

export type EraseStage = "download" | "segment" | "inpaint" | "compose";
export type EraseProgress = (stage: EraseStage) => void;

// ---------------------------------------------------------------------------
// Carregamento das bibliotecas e modelos (uma vez por página)
// ---------------------------------------------------------------------------

/* Tipos mínimos do que usamos do onnxruntime-web e do transformers.js (carregados pela CDN). */
interface OrtTensor {
  data: Uint8Array;
  dims: number[];
}
interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
}
interface Ort {
  env: { wasm: { wasmPaths?: string | object; numThreads?: number } };
  Tensor: new (type: string, data: Uint8Array, dims: number[]) => unknown;
  InferenceSession: { create(model: Uint8Array, opts?: Record<string, unknown>): Promise<OrtSession> };
}
interface TfTensor {
  data: ArrayLike<number> & { length: number };
  dims: number[];
}
interface Transformers {
  AutoModel: { from_pretrained(id: string, opts?: Record<string, unknown>): Promise<SegModel> };
  AutoProcessor: { from_pretrained(id: string): Promise<SegProcessor> };
  RawImage: { fromURL(url: string): Promise<{ width: number; height: number }> };
}
interface SegModel {
  get_image_embeddings(inputs: unknown): Promise<Record<string, unknown>>;
  (inputs: Record<string, unknown>): Promise<{ pred_masks: TfTensor; iou_scores: TfTensor }>;
}
interface SegProcessor {
  (image: unknown, opts?: { input_boxes?: number[][][] }): Promise<Record<string, unknown> & {
    input_boxes?: unknown;
    original_sizes: unknown;
    reshaped_input_sizes: unknown;
  }>;
  post_process_masks(masks: TfTensor, original: unknown, reshaped: unknown): Promise<TfTensor[]>;
}

const importFromUrl = (url: string) => import(/* webpackIgnore: true */ url) as Promise<unknown>;

let ortPromise: Promise<Ort> | null = null;
function loadOrt(): Promise<Ort> {
  ortPromise ??= importFromUrl(`${ORT_BASE}ort.min.mjs`).then((m) => {
    const ort = ((m as { default?: Ort }).default ?? m) as Ort;
    ort.env.wasm.wasmPaths = ORT_BASE;
    // O transformers.js usa este mesmo runtime (um único download do wasm)
    (globalThis as Record<symbol, unknown>)[Symbol.for("onnxruntime")] = ort;
    return ort;
  });
  ortPromise.catch(() => (ortPromise = null));
  return ortPromise;
}

let segPromise: Promise<{ tf: Transformers; model: SegModel; processor: SegProcessor }> | null = null;
function loadSegmenter() {
  segPromise ??= (async () => {
    await loadOrt();
    const tf = (await importFromUrl(TRANSFORMERS_URL)) as Transformers;
    const [model, processor] = await Promise.all([
      tf.AutoModel.from_pretrained(SEGMENT_MODEL, {
        dtype: { vision_encoder: "fp16", prompt_encoder_mask_decoder: "fp16" },
        // Com o runtime injetado, o transformers.js não registra dispositivos e recusa "wasm";
        // "auto" passa na validação e o provedor de execução é definido aqui
        device: "auto",
        session_options: { executionProviders: ["wasm"] },
      }),
      tf.AutoProcessor.from_pretrained(SEGMENT_MODEL),
    ]);
    return { tf, model, processor };
  })();
  segPromise.catch(() => (segPromise = null));
  return segPromise;
}

/** Baixa o modelo com o Cache API (fica salvo entre visitas). */
async function fetchCached(url: string): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = null; // Cache API indisponível (ex.: navegação privada)
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar o modelo (${res.status}).`);
  const buf = await res.arrayBuffer();
  try {
    await cache?.put(url, new Response(buf.slice(0)));
  } catch {
    /* sem espaço: segue sem cache */
  }
  return new Uint8Array(buf);
}

let inpaintPromise: Promise<{ ort: Ort; session: OrtSession }> | null = null;
function loadInpainter() {
  inpaintPromise ??= (async () => {
    const [ort, bytes] = await Promise.all([loadOrt(), fetchCached(INPAINT_MODEL_URL)]);
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
    return { ort, session };
  })();
  inpaintPromise.catch(() => (inpaintPromise = null));
  return inpaintPromise;
}

/** Começa a baixar os modelos em segundo plano (ex.: ao abrir o modo de seleção). */
export function preloadEraser() {
  loadSegmenter().catch(() => {});
  loadInpainter().catch(() => {});
}

// ---------------------------------------------------------------------------
// Máscara: operações morfológicas em O(n) (dilatação quadrada separável)
// ---------------------------------------------------------------------------

function dilate1D(src: Uint8Array, dst: Uint8Array, len: number, start: number, stride: number, r: number) {
  // distância até o pixel marcado mais próximo, para trás e para frente
  let last = -Infinity;
  const dist = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    if (src[start + i * stride]) last = i;
    dist[i] = i - last;
  }
  let next = Infinity;
  for (let i = len - 1; i >= 0; i--) {
    if (src[start + i * stride]) next = i;
    dst[start + i * stride] = Math.min(dist[i], next - i) <= r ? 1 : 0;
  }
}

function dilate(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  if (r <= 0) return m.slice();
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) dilate1D(m, tmp, W, y * W, 1, r);
  for (let x = 0; x < W; x++) dilate1D(tmp, out, H, x, W, r);
  return out;
}

function erode(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const inv = m.map((v) => (v ? 0 : 1));
  return dilate(inv, W, H, r).map((v) => (v ? 0 : 1));
}

/** Fundo não alcançável pela borda (ex.: roupa em cima do sofá) passa a fazer parte da máscara. */
function fillHoles(m: Uint8Array, W: number, H: number): Uint8Array {
  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!m[i] && !seen[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) {
    push(x);
    push((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    push(y * W);
    push(y * W + W - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < W * (H - 1)) push(i + W);
  }
  return m.map((v, i) => (v || !seen[i] ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/**
 * Cache da última foto processada: o embedding (a parte mais lenta) e o contorno de cada móvel.
 * Assim, devolver um móvel à foto ou remover mais um só refaz o preenchimento.
 */
let segCache: {
  key: string;
  image: unknown;
  embeddings: Record<string, unknown>;
  masks: Map<string, Uint8Array>;
} | null = null;

const boxKey = (b: DetectedObject["box"]) => [b.x, b.y, b.w, b.h].map((v) => v.toFixed(2)).join(",");

/** Contorno de cada móvel (união), na resolução de trabalho. Sem contorno confiável, usa a caixa. */
async function segmentObjects(work: HTMLCanvasElement, objects: DetectedObject[], photoKey: string): Promise<Uint8Array> {
  const W = work.width;
  const H = work.height;
  const n = W * H;
  const union = new Uint8Array(n);
  const key = `${photoKey.length}:${photoKey.slice(0, 64)}:${photoKey.slice(-64)}:${W}x${H}`;
  const cached = segCache?.key === key ? segCache : null;

  let ctx = cached;
  for (const obj of objects) {
    const b = obj.box;
    const hit = ctx?.masks.get(boxKey(b));
    if (hit) {
      for (let i = 0; i < n; i++) if (hit[i]) union[i] = 1;
      continue;
    }
    if (!ctx) {
      const { tf, model, processor } = await loadSegmenter();
      const image = await tf.RawImage.fromURL(work.toDataURL("image/jpeg", 0.95));
      const embeddings = await model.get_image_embeddings(await processor(image));
      ctx = segCache = { key, image, embeddings, masks: new Map() };
    }
    const objMask = new Uint8Array(n);
    const { model, processor } = await loadSegmenter();
    const image = ctx.image;
    const embeddings = ctx.embeddings;
    const x0 = (b.x / 100) * W;
    const y0 = (b.y / 100) * H;
    const x1 = ((b.x + b.w) / 100) * W;
    const y1 = ((b.y + b.h) / 100) * H;
    let ok = false;
    try {
      const inputs = await processor(image, { input_boxes: [[[x0, y0, x1, y1]]] });
      const out = await model({ ...embeddings, input_boxes: inputs.input_boxes });
      const masks = await processor.post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
      const scores = out.iou_scores.data;
      let best = 0;
      for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
      const data = masks[0].data;
      let area = 0;
      for (let i = 0; i < n; i++) if (data[best * n + i]) area++;
      const boxArea = Math.max(1, (x1 - x0) * (y1 - y0));
      // Contorno confiável: boa nota e ocupa uma parte razoável da caixa
      if (scores[best] >= 0.5 && area >= boxArea * 0.15) {
        for (let i = 0; i < n; i++) if (data[best * n + i]) objMask[i] = 1;
        ok = true;
      }
    } catch (e) {
      console.warn("Contorno automático falhou; usando a caixa do móvel.", e);
    }
    if (!ok) {
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) objMask[y * W + x] = 1;
      }
    }
    ctx.masks.set(boxKey(b), objMask);
    for (let i = 0; i < n; i++) if (objMask[i]) union[i] = 1;
  }
  return union;
}

async function inpaint(work: HTMLCanvasElement, mask: Uint8Array): Promise<HTMLCanvasElement> {
  const W = work.width;
  const H = work.height;
  const { ort, session } = await loadInpainter();
  const rgba = work.getContext("2d")!.getImageData(0, 0, W, H).data;
  const n = W * H;
  const chw = new Uint8Array(3 * n);
  const keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    chw[i] = rgba[i * 4];
    chw[n + i] = rgba[i * 4 + 1];
    chw[2 * n + i] = rgba[i * 4 + 2];
    keep[i] = mask[i] ? 0 : 255; // MI-GAN: 255 = manter, 0 = apagar
  }
  const out = await session.run({
    image: new ort.Tensor("uint8", chw, [1, 3, H, W]),
    mask: new ort.Tensor("uint8", keep, [1, 1, H, W]),
  });
  const res = out.result;
  const [, , rh, rw] = res.dims;
  const c = canvasOf(rw, rh);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(rw, rh);
  const m = rw * rh;
  for (let i = 0; i < m; i++) {
    img.data[i * 4] = res.data[i];
    img.data[i * 4 + 1] = res.data[m + i];
    img.data[i * 4 + 2] = res.data[2 * m + i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Apaga os móveis indicados da foto e devolve a foto resultante (JPEG data URL).
 * A parte não apagada continua sendo a foto original, na resolução original (até 2048 px).
 */
export async function eraseObjects(roomImage: string, objects: DetectedObject[], onProgress?: EraseProgress): Promise<string> {
  if (objects.length === 0) return roomImage;
  onProgress?.("download");
  const [room] = await Promise.all([loadImageElement(roomImage), loadSegmenter(), loadInpainter()]);
  const nw = room.naturalWidth || 1200;
  const nh = room.naturalHeight || 800;

  // Imagem de trabalho
  const kw = Math.min(1, WORK_SIZE / Math.max(nw, nh));
  const W = Math.max(1, Math.round(nw * kw));
  const H = Math.max(1, Math.round(nh * kw));
  const work = canvasOf(W, H);
  work.getContext("2d")!.drawImage(room, 0, 0, W, H);

  onProgress?.("segment");
  await nextFrame();
  const L = Math.max(W, H);
  const raw = await segmentObjects(work, objects, roomImage);
  const closed = erode(dilate(raw, W, H, Math.round(L * 0.04)), W, H, Math.round(L * 0.04));
  const mask = dilate(fillHoles(closed, W, H), W, H, Math.round(L * 0.015));

  onProgress?.("inpaint");
  await nextFrame();
  const filled = await inpaint(work, mask);

  // Recompõe: foto original + área apagada (com borda suave) vinda do resultado
  onProgress?.("compose");
  const ko = Math.min(1, OUTPUT_SIZE / Math.max(nw, nh));
  const OW = Math.max(1, Math.round(nw * ko));
  const OH = Math.max(1, Math.round(nh * ko));
  const maskCanvas = canvasOf(W, H);
  const mctx = maskCanvas.getContext("2d")!;
  const mimg = mctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) mimg.data[i * 4 + 3] = mask[i] ? 255 : 0;
  mctx.putImageData(mimg, 0, 0);

  const patch = canvasOf(OW, OH);
  const pctx = patch.getContext("2d")!;
  pctx.drawImage(filled, 0, 0, OW, OH);
  pctx.globalCompositeOperation = "destination-in";
  pctx.filter = `blur(${Math.max(1, Math.round(OW / 400))}px)`;
  pctx.drawImage(maskCanvas, 0, 0, OW, OH);

  const outCanvas = canvasOf(OW, OH);
  const octx = outCanvas.getContext("2d")!;
  octx.drawImage(room, 0, 0, OW, OH);
  octx.drawImage(patch, 0, 0);
  return outCanvas.toDataURL("image/jpeg", 0.92);
}
