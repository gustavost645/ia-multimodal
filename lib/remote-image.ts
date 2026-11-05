/**
 * Busca segura de imagens remotas (usada pela rota /api/image-proxy) e helper de URL
 * para o navegador. A busca só deve rodar no servidor.
 */

export const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const REMOTE_IMAGE_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;

export class RemoteImageError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "RemoteImageError";
    this.status = status;
  }
}

/** Hosts permitidos: Unsplash, Picsum, VTEX assets e o site da Benoit. */
export function isAllowedImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "images.unsplash.com" ||
    h === "picsum.photos" ||
    h.endsWith(".picsum.photos") ||
    h === "vtexassets.com" ||
    h.endsWith(".vtexassets.com") ||
    h === "benoit.com.br" ||
    h.endsWith(".benoit.com.br")
  );
}

function assertAllowedUrl(url: URL): void {
  if (url.protocol !== "https:") throw new RemoteImageError("Somente URLs https são aceitas.", 400);
  if (url.username || url.password || url.port) throw new RemoteImageError("URL inválida.", 400);
  if (!isAllowedImageHost(url.hostname)) throw new RemoteImageError("Host de imagem não permitido.", 403);
}

export interface RemoteImage {
  data: ArrayBuffer;
  contentType: string;
}

async function readLimited(res: Response): Promise<ArrayBuffer> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_REMOTE_IMAGE_BYTES) throw new RemoteImageError("Imagem maior que 8 MB.", 413);
  if (!res.body) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_REMOTE_IMAGE_BYTES) throw new RemoteImageError("Imagem maior que 8 MB.", 413);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REMOTE_IMAGE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new RemoteImageError("Imagem maior que 8 MB.", 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/** Baixa uma imagem validando allowlist (inclusive após redirecionamentos), tipo e tamanho. */
export async function fetchRemoteImage(rawUrl: string): Promise<RemoteImage> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RemoteImageError("URL inválida.", 400);
  }

  const signal = AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      assertAllowedUrl(url);
      const res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { Accept: "image/*", "User-Agent": "Mozilla/5.0 (BenoitCasaViva image proxy)" },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new RemoteImageError("Redirecionamento inválido.", 502);
        url = new URL(location, url); // o host final é revalidado na próxima volta
        continue;
      }
      if (!res.ok) throw new RemoteImageError(`Origem respondeu ${res.status}.`, 502);

      const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!contentType.startsWith("image/") || contentType.includes("svg")) {
        throw new RemoteImageError("A URL não é uma imagem aceita.", 415);
      }
      const data = await readLimited(res);
      return { data, contentType };
    }
    throw new RemoteImageError("Redirecionamentos demais.", 508);
  } catch (err) {
    if (err instanceof RemoteImageError) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new RemoteImageError("Tempo esgotado ao buscar a imagem.", 504);
    }
    throw new RemoteImageError("Falha ao buscar a imagem.", 502);
  }
}

/**
 * URL para usar no navegador: imagens remotas passam pelo proxy (mesma origem, sem CORS,
 * canvas nunca fica "tainted"). data:, blob: e caminhos locais ficam como estão.
 */
export function toProxiedImageUrl(src: string): string {
  if (!/^https?:\/\//i.test(src)) return src;
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}
