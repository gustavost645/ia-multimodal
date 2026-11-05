"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DetectedObject, GenerateRequest, GenerateResponse, SceneItem } from "@/lib/scene-types";
import { loadCutout } from "@/lib/background-remover";
import { renderSceneToBlob } from "./renderScene";
import { itemWidthPercent, sortByZ, type ShadowParams } from "./geometry";

/** Recorta a imagem gerada (box em %) para voltar à proporção da foto original. Em caso de erro, devolve a original. */
async function cropDataUrl(src: string, box: { x: number; y: number; w: number; h: number }): Promise<string> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const sx = (box.x / 100) * img.naturalWidth;
    const sy = (box.y / 100) * img.naturalHeight;
    const sw = (box.w / 100) * img.naturalWidth;
    const sh = (box.h / 100) * img.naturalHeight;
    if (!(sw > 1 && sh > 1)) return src;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    canvas.getContext("2d")?.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return src;
  }
}

export interface GeneratedPhoto {
  image: string; // data URL
  model?: string;
  signature: string;
  createdAt: number;
}

export interface GenerateError {
  reason: NonNullable<GenerateResponse["reason"]> | "cancelled";
  message: string;
}

export interface GenerateInput {
  /** foto ORIGINAL (sem a prévia de remoção: a IA remove os móveis com mais qualidade) */
  roomImage: string;
  items: SceneItem[];
  /** móveis da foto a remover sem colocar nada no lugar */
  removed?: DetectedObject[];
  cmPerPercentX: number;
  shadow: ShadowParams;
  /** largura/altura da foto */
  aspect: number;
  signature: string;
}

const MAX_GUIDE_BYTES = 4 * 1024 * 1024;

/** Depois de um erro de faturamento, não gasta mais chamadas nesta sessão. */
const BILLING_BLOCK_MS = 10 * 60 * 1000;
let billingBlockedAt = 0;
const isBillingBlocked = () => billingBlockedAt > 0 && Date.now() - billingBlockedAt < BILLING_BLOCK_MS;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function buildGuide(input: GenerateInput): Promise<string> {
  for (const [maxSize, quality] of [
    [1280, 0.85],
    [1280, 0.7],
    [960, 0.65],
  ] as const) {
    const blob = await renderSceneToBlob({
      roomImage: input.roomImage,
      items: input.items,
      cmPerPercentX: input.cmPerPercentX,
      shadow: input.shadow,
      maxSize,
      quality,
      markReplaced: true,
      removed: input.removed,
    });
    if (blob && blob.size <= MAX_GUIDE_BYTES) return blobToDataUrl(blob);
  }
  throw new Error("guide");
}

export function useRealisticPhoto(value?: GeneratedPhoto | null, onChange?: (p: GeneratedPhoto | null) => void) {
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [localResult, setLocalResult] = useState<GeneratedPhoto | null>(null);
  const [unavailable, setUnavailable] = useState(() => isBillingBlocked());
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  // Se a página fornece o estado (value/onChange), ele é a fonte da verdade
  const result = onChange ? (value ?? null) : localResult;
  const setResult = useCallback((p: GeneratedPhoto | null) => {
    if (onChangeRef.current) onChangeRef.current(p);
    else setLocalResult(p);
  }, []);
  const [error, setError] = useState<GenerateError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status !== "loading") return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // O bloqueio por faturamento expira (igual ao servidor)
  useEffect(() => {
    if (!unavailable) return;
    const remaining = Math.max(0, BILLING_BLOCK_MS - (Date.now() - billingBlockedAt));
    const id = setTimeout(() => setUnavailable(false), remaining);
    return () => clearTimeout(id);
  }, [unavailable]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const dismissError = useCallback(() => setError(null), []);

  const generate = useCallback(async (input: GenerateInput): Promise<boolean> => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setElapsed(0);
    setError(null);
    let ok = false;
    try {
      const guideImage = await buildGuide(input);
      const sorted = sortByZ(input.items);
      const cutouts = await Promise.all(sorted.map((i) => loadCutout(i.product.imageUrl)));
      const body: GenerateRequest = {
        roomImage: input.roomImage,
        guideImage,
        items: sorted.map((item, idx) => {
          const widthPct = itemWidthPercent(item, input.cmPerPercentX);
          const aspect = cutouts[idx]?.aspect ?? 0.7;
          return {
            productName: item.product.name,
            productImageUrl: item.product.imageUrl,
            x: item.x,
            y: item.y,
            widthPct,
            heightPct: widthPct * aspect * input.aspect,
            flipped: item.flipped,
            rotation: item.rotation ?? 0,
            replaces: item.replaces,
          };
        }),
        ...(input.removed?.length ? { removed: input.removed } : {}),
      };
      const res = await fetch("/api/room/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      let json: GenerateResponse | null = null;
      try {
        json = (await res.json()) as GenerateResponse;
      } catch {
        json = null;
      }
      if (json?.success && json.image) {
        const image = json.cropBox ? await cropDataUrl(json.image, json.cropBox) : json.image;
        setResult({ image, model: json.model, signature: input.signature, createdAt: Date.now() });
        ok = true;
      } else {
        if (json?.reason === "billing") {
          billingBlockedAt = Date.now();
          setUnavailable(true);
        }
        setError({
          reason: json?.reason ?? "error",
          message: json?.error ?? "Não foi possível gerar a foto realista agora.",
        });
      }
    } catch (err) {
      if (ctrl.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        setError({ reason: "cancelled", message: "Geração cancelada." });
      } else {
        setError({ reason: "error", message: "Não foi possível gerar a foto realista agora." });
      }
    } finally {
      if (abortRef.current === ctrl) setStatus("idle");
    }
    return ok;
  }, [setResult]);

  return { status, elapsed, result, error, unavailable, generate, cancel, dismissError };
}
