import { NextResponse } from "next/server";
import { isAllowedImageHost } from "@/lib/remote-image";
import { saveShare, type NewShare, type SharedProduct } from "@/lib/share-store";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PRODUCTS = 20;
const RATE_LIMIT = 20;
const MAX_BODY_BYTES = 5.5 * 1024 * 1024;
const MAX_THUMB_BYTES = 400 * 1024;
const RATE_WINDOW_MS = 60 * 60 * 1000;

// Limite simples por IP, em memória (reinicia com o servidor; suficiente contra abuso casual).
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return false;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function allowedUrl(value: unknown, images = false): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (images) return isAllowedImageHost(h) ? u.toString() : null;
    const ok = h === "benoit.com.br" || h.endsWith(".benoit.com.br") || h.endsWith(".vtexassets.com");
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

function parseDims(v: unknown) {
  const d = (v ?? {}) as Record<string, unknown>;
  const widthCm = num(d.widthCm, 0, 5000);
  const heightCm = num(d.heightCm, 0, 5000);
  const depthCm = num(d.depthCm, 0, 5000);
  return widthCm !== null && heightCm !== null && depthCm !== null ? { widthCm, heightCm, depthCm } : null;
}

function parseProduct(raw: unknown): SharedProduct | string {
  if (!raw || typeof raw !== "object") return "Produto inválido.";
  const p = raw as Record<string, unknown>;
  const id = str(p.id, 100);
  const sku = str(p.sku, 50);
  const name = str(p.name, 200);
  const price = num(p.price, 0, 1_000_000);
  const dimensions = parseDims(p.dimensions);
  const rawImage = typeof p.imageUrl === "string" ? p.imageUrl.trim() : "";
  const imageUrl = rawImage ? allowedUrl(rawImage, true) : undefined;
  const productUrl = allowedUrl(p.productUrl);
  if (!id || !sku || !name || price === null || !dimensions) return "Dados de produto incompletos.";
  if (imageUrl === null || !productUrl) return "Links de produto não permitidos (apenas benoit.com.br).";
  const sellerId = str(p.sellerId, 20);
  return {
    id,
    sku,
    ...(sellerId ? { sellerId } : {}),
    name,
    brand: str(p.brand, 100),
    price,
    installment: str(p.installment, 100),
    ...(imageUrl ? { imageUrl } : {}),
    productUrl,
    dimensions,
  };
}

/** Lê largura/altura do marcador SOF de um JPEG. */
function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

export async function POST(req: Request) {
  // x-real-ip (definido pelo proxy) ou o ÚLTIMO item de x-forwarded-for (o primeiro é falsificável).
  const xff = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  const ip = req.headers.get("x-real-ip") || xff?.[xff.length - 1] || "local";
  if (rateLimited(ip)) return fail("Muitos compartilhamentos em pouco tempo. Tente novamente mais tarde.", 429);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return fail("Envio grande demais.", 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Requisição inválida.");
  }

  const image = form.get("image");
  if (!(image instanceof Blob) || image.size === 0) return fail("Imagem ausente.");
  if (image.size > MAX_IMAGE_BYTES) return fail("Imagem maior que 4 MB.", 413);
  const bytes = Buffer.from(await image.arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isJpeg && !isPng) return fail("A imagem precisa ser JPEG ou PNG.", 415);

  let thumb: Buffer | undefined;
  const thumbField = form.get("thumb");
  if (thumbField instanceof Blob && thumbField.size > 0) {
    if (thumbField.size > MAX_THUMB_BYTES) return fail("Miniatura grande demais.", 413);
    thumb = Buffer.from(await thumbField.arrayBuffer());
    if (!(thumb[0] === 0xff && thumb[1] === 0xd8 && thumb[2] === 0xff) || !jpegSize(thumb)) return fail("Miniatura inválida.", 415);
  }

  const dataField = form.get("data");
  if (typeof dataField !== "string" || dataField.length > 100_000) return fail("Dados ausentes ou grandes demais.");
  let data: { products?: unknown; measurements?: unknown; aiGenerated?: unknown };
  try {
    data = JSON.parse(dataField);
  } catch {
    return fail("JSON inválido.");
  }
  if (!Array.isArray(data.products) || data.products.length === 0) return fail("Nenhum produto na simulação.");
  if (data.products.length > MAX_PRODUCTS) return fail(`No máximo ${MAX_PRODUCTS} produtos por simulação.`);

  const products: SharedProduct[] = [];
  for (const raw of data.products) {
    const p = parseProduct(raw);
    if (typeof p === "string") return fail(p);
    products.push(p);
  }
  let measurements: NewShare["measurements"];
  if (data.measurements != null) {
    const m = parseDims(data.measurements);
    if (!m) return fail("Medidas do cômodo inválidas.");
    measurements = m;
  }

  const record = await saveShare(
    { products, measurements, aiGenerated: data.aiGenerated === true, imageType: isJpeg ? "image/jpeg" : "image/png", thumb: thumb ? jpegSize(thumb)! : undefined },
    bytes,
    thumb,
  );
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
  return NextResponse.json({ id: record.id, url: `${origin}/simulacao/${record.id}` });
}
