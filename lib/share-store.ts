/**
 * Armazenamento das simulações compartilhadas.
 *
 * Implementação atual: DISCO LOCAL em `.data/shares/<id>.json` + `<id>.jpg`.
 * Serve para desenvolvimento e para hospedagem com disco persistente (VPS, Docker com volume).
 * NÃO funciona em hospedagem serverless (Vercel etc.): lá, troque APENAS as funções deste
 * arquivo (saveShare, getShare, getShareImage) por um storage na nuvem (S3, R2, Vercel Blob,
 * Supabase...) mantendo as mesmas assinaturas; API e páginas não precisam mudar.
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SharedProduct {
  id: string;
  sku: string;
  sellerId?: string;
  name: string;
  brand: string;
  price: number;
  installment: string;
  imageUrl?: string;
  productUrl: string;
  dimensions: { widthCm: number; heightCm: number; depthCm: number };
}

export interface ShareRecord {
  id: string;
  createdAt: string;
  expiresAt: string;
  products: SharedProduct[];
  measurements?: { widthCm: number; heightCm: number; depthCm: number };
  /** Tipo real da imagem gravada em <id>.jpg (JPEG ou PNG). */
  imageType: "image/jpeg" | "image/png";
  /** Miniatura JPEG leve (<300 KB) usada no og:image (WhatsApp ignora imagens grandes). */
  /** Imagem gerada por IA (ilustrativa). */
  aiGenerated?: boolean;
  thumb?: { width: number; height: number };
}

export type NewShare = Pick<ShareRecord, "products" | "measurements" | "imageType" | "thumb" | "aiGenerated">;

const DIR = path.join(process.cwd(), ".data", "shares");
// Sem 0/o/1/l/i para facilitar ditar o código ao vendedor.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 31 letras
const ID_LENGTH = 12;

/** Normaliza o que o usuário digita ("ab3k-9xyz-23mn" -> "ab3k9xyz23mn") e valida o formato. */
export function normalizeShareId(raw: string): string | null {
  const id = raw.replace(/[\s-]/g, "").toLowerCase();
  return new RegExp(`^[${ALPHABET}]{${ID_LENGTH}}$`).test(id) ? id : null;
}

/** "ab3k9xyz23mn" -> "AB3K-9XYZ-23MN" */
export function formatShareCode(id: string): string {
  return (id.match(/.{1,4}/g) ?? [id]).join("-").toUpperCase();
}

function newId(): string {
  const bytes = randomBytes(ID_LENGTH * 2);
  let id = "";
  for (const b of bytes) {
    if (b < 248) id += ALPHABET[b % ALPHABET.length]; // 248 = 31*8, evita viés
    if (id.length === ID_LENGTH) break;
  }
  return id.length === ID_LENGTH ? id : newId();
}

export async function saveShare(data: NewShare, image: Buffer, thumb?: Buffer): Promise<ShareRecord> {
  await fs.mkdir(DIR, { recursive: true });
  const now = Date.now();
  const record: ShareRecord = {
    id: newId(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SHARE_TTL_MS).toISOString(),
    ...data,
  };
  await fs.writeFile(path.join(DIR, `${record.id}.jpg`), image);
  if (thumb) await fs.writeFile(path.join(DIR, `${record.id}.thumb.jpg`), thumb);
  await fs.writeFile(path.join(DIR, `${record.id}.json`), JSON.stringify(record));
  void purgeExpired();
  return record;
}

async function remove(id: string) {
  await Promise.all([
    fs.rm(path.join(DIR, `${id}.json`), { force: true }),
    fs.rm(path.join(DIR, `${id}.jpg`), { force: true }),
    fs.rm(path.join(DIR, `${id}.thumb.jpg`), { force: true }),
  ]);
}

/** Devolve a simulação ou null se não existir / expirou. */
export async function getShare(rawId: string): Promise<ShareRecord | null> {
  const id = normalizeShareId(rawId);
  if (!id) return null;
  try {
    const record = JSON.parse(await fs.readFile(path.join(DIR, `${id}.json`), "utf8")) as ShareRecord;
    if (Date.parse(record.expiresAt) <= Date.now()) {
      void remove(id);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export async function getShareImage(rawId: string, thumb = false): Promise<{ data: Buffer; type: string } | null> {
  const record = await getShare(rawId);
  if (!record) return null;
  try {
    if (thumb) {
      if (!record.thumb) return null;
      return { data: await fs.readFile(path.join(DIR, `${record.id}.thumb.jpg`)), type: "image/jpeg" };
    }
    return { data: await fs.readFile(path.join(DIR, `${record.id}.jpg`)), type: record.imageType };
  } catch {
    return null;
  }
}

let lastPurge = 0;
async function purgeExpired() {
  if (Date.now() - lastPurge < 60 * 60 * 1000) return;
  lastPurge = Date.now();
  try {
    for (const f of await fs.readdir(DIR)) {
      if (!f.endsWith(".json")) continue;
      const id = f.slice(0, -5);
      try {
        const r = JSON.parse(await fs.readFile(path.join(DIR, f), "utf8")) as ShareRecord;
        if (Date.parse(r.expiresAt) <= Date.now()) await remove(id);
      } catch {
        /* ignora arquivo corrompido */
      }
    }
  } catch {
    /* pasta ainda não existe */
  }
}
