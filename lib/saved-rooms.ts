/**
 * "Meus ambientes": CRUD de SavedRoom em IndexedDB, sem dependências.
 * Se o IndexedDB não estiver disponível (aba anônima, bloqueio, SSR),
 * usa um armazenamento em memória (vale apenas enquanto a página estiver aberta).
 */
import type { SavedRoom } from "@/lib/scene-types";

const DB_NAME = "benoit-casa-viva";
const STORE = "saved-rooms";
const DB_VERSION = 1;
export const SAVED_ROOM_MAX_IMAGE_SIDE = 1600;

export type SaveRoomInput = Omit<SavedRoom, "id" | "createdAt" | "updatedAt"> & {
  /** Se informado e existir, atualiza esse ambiente; senão cria um novo. */
  id?: string;
};

const memory = new Map<string, SavedRoom>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  });
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // ignora
  }
  return `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Reduz a imagem para no máximo `maxSide` px no lado maior (JPEG ~0.85). Em caso de falha, devolve a original. */
export async function downscaleImage(
  src: string,
  maxSide = SAVED_ROOM_MAX_IMAGE_SIDE,
  quality = 0.85,
): Promise<string> {
  if (typeof window === "undefined") return src;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      if (!src.startsWith("data:") && !src.startsWith("blob:")) el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("img"));
      el.src = src;
    });
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return src;
    if (Math.max(w, h) <= maxSide && src.startsWith("data:image/jpeg")) return src;
    const ratio = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return src;
  }
}

export async function listSavedRooms(): Promise<SavedRoom[]> {
  let rooms: SavedRoom[] = [];
  try {
    const db = await openDb();
    rooms = db ? await run<SavedRoom[]>(db, "readonly", (s) => s.getAll()) : [...memory.values()];
  } catch {
    rooms = [...memory.values()];
  }
  return rooms.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSavedRoom(id: string): Promise<SavedRoom | undefined> {
  try {
    const db = await openDb();
    if (db) return (await run<SavedRoom | undefined>(db, "readonly", (s) => s.get(id))) ?? undefined;
  } catch {
    // cai no fallback
  }
  return memory.get(id);
}

async function putRoom(room: SavedRoom): Promise<void> {
  // JSON evita DataCloneError com valores não clonáveis
  const plain: SavedRoom = JSON.parse(JSON.stringify(room));
  try {
    const db = await openDb();
    if (db) {
      await run(db, "readwrite", (s) => s.put(plain));
      return;
    }
  } catch {
    // cai no fallback
  }
  memory.set(plain.id, plain);
}

/** Cria ou atualiza um ambiente. Retorna o registro salvo. */
export async function saveRoom(input: SaveRoomInput): Promise<SavedRoom> {
  const now = Date.now();
  const existing = input.id ? await getSavedRoom(input.id) : undefined;
  const roomImage = await downscaleImage(input.roomImage);
  const erasedImage = input.erasedImage && input.erasedObjects?.length ? await downscaleImage(input.erasedImage) : undefined;
  const room: SavedRoom = {
    ...input,
    erasedImage,
    erasedObjects: erasedImage ? input.erasedObjects : undefined,
    id: existing?.id ?? input.id ?? newId(),
    name: input.name.trim() || "Meu ambiente",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    roomImage,
  };
  await putRoom(room);
  return room;
}

export async function deleteSavedRoom(id: string): Promise<void> {
  memory.delete(id);
  try {
    const db = await openDb();
    if (db) await run(db, "readwrite", (s) => s.delete(id));
  } catch {
    // ignora
  }
}

export async function renameSavedRoom(id: string, name: string): Promise<SavedRoom | undefined> {
  const room = await getSavedRoom(id);
  if (!room) return undefined;
  const updated: SavedRoom = { ...room, name: name.trim() || room.name, updatedAt: Date.now() };
  await putRoom(updated);
  return updated;
}
