"use client";

import { useEffect, useMemo, useState } from "react";
import { loadCutout, type Cutout } from "@/lib/background-remover";
import type { BenoitProduct } from "@/data/benoit-catalog";

export type CutoutMap = Record<string, Cutout | null | undefined>;

/**
 * Carrega (e cacheia por URL) o recorte das imagens informadas.
 * Valor undefined = carregando; null = falhou.
 */
export function useCutouts(urls: string[]): { cutouts: CutoutMap; loading: boolean } {
  const [cutouts, setCutouts] = useState<CutoutMap>({});
  const key = useMemo(() => Array.from(new Set(urls)).sort().join("\n"), [urls]);

  useEffect(() => {
    let alive = true;
    for (const url of key ? key.split("\n") : []) {
      loadCutout(url).then((c) => {
        if (!alive) return;
        setCutouts((prev) => (prev[url] === c ? prev : { ...prev, [url]: c }));
      });
    }
    return () => {
      alive = false;
    };
  }, [key]);

  const loading = (key ? key.split("\n") : []).some((u) => cutouts[u] === undefined);
  return { cutouts, loading };
}

export function productImageUrls(products: BenoitProduct[]): string[] {
  return products.map((p) => p.imageUrl).filter(Boolean);
}

// ---------- Variações de cor (rota do agente A) ----------

const variantsCache = new Map<string, Promise<BenoitProduct[]>>();

export function fetchVariants(product: BenoitProduct): Promise<BenoitProduct[]> {
  const cached = variantsCache.get(product.id);
  if (cached) return cached;
  const params = new URLSearchParams({ name: product.name, id: product.id });
  const promise = fetch(`/api/benoit/variants?${params.toString()}`)
    .then((r) => (r.ok ? r.json() : { variants: [] }))
    .then((j: { variants?: BenoitProduct[] }) => (Array.isArray(j.variants) ? j.variants : []))
    .catch(() => [] as BenoitProduct[]);
  variantsCache.set(product.id, promise);
  promise.then((v) => {
    if (v.length === 0) variantsCache.delete(product.id);
  });
  return promise;
}
