/** Garante JPEG/PNG de até ~3,8 MB (a API aceita 4 MB). Reduz/recodifica em JPEG se preciso. */
const LIMIT = 3.8 * 1024 * 1024;

export async function prepareImageForUpload(blob: Blob): Promise<Blob> {
  const okType = blob.type === "image/jpeg" || blob.type === "image/png";
  if (okType && blob.size <= LIMIT) return blob;
  const bitmap = await createImageBitmap(blob);
  let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (out && out.size <= LIMIT) return out;
    scale *= 0.75;
  }
  throw new Error("Não foi possível reduzir a imagem para o tamanho permitido.");
}

/** Miniatura JPEG (~1200 px, alvo < 300 KB) para o preview do WhatsApp (og:image). */
export async function makeThumbnail(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    let width = Math.min(1200, bitmap.width);
    let quality = 0.7;
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round((bitmap.height * width) / bitmap.width);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (out && out.size <= 300 * 1024) return out;
      width = Math.round(width * 0.85);
      quality = Math.max(0.5, quality - 0.05);
    }
  } catch {
    /* sem miniatura: a página usa a imagem grande */
  }
  return null;
}
