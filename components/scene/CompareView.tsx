"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { BenoitProduct } from "@/data/benoit-catalog";
import type { SceneItem } from "@/lib/scene-types";
import { SceneCanvas } from "./SceneCanvas";
import { fetchVariants, useCutouts } from "./useCutout";
import { formatBRL, type ShadowParams } from "./geometry";

interface CompareViewProps {
  roomImage: string;
  aspect: number;
  items: SceneItem[];
  /** item cujo produto será comparado */
  item: SceneItem;
  recentProducts: BenoitProduct[];
  cmPerPercentX: number;
  shadow: ShadowParams;
  onUse: (product: BenoitProduct) => void;
}

const MAX_ALTERNATIVES = 2;

export function CompareView({
  roomImage,
  aspect,
  items,
  item,
  recentProducts,
  cmPerPercentX,
  shadow,
  onUse,
}: CompareViewProps) {
  const [variants, setVariants] = useState<BenoitProduct[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(true);
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchVariants(item.product).then((v) => {
      if (!alive) return;
      setVariants(v);
      setLoadingVariants(false);
    });
    return () => {
      alive = false;
    };
  }, [item.product]);

  const candidates = useMemo(() => {
    const seen = new Set<string>([item.product.id]);
    const out: { product: BenoitProduct; source: string }[] = [];
    for (const p of variants) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push({ product: p, source: "Outra cor" });
      }
    }
    for (const p of recentProducts) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push({ product: p, source: "Visto recentemente" });
      }
    }
    return out;
  }, [variants, recentProducts, item.product]);

  const picked = pickedIds
    .map((id) => candidates.find((c) => c.product.id === id)?.product)
    .filter((p): p is BenoitProduct => !!p);

  const versions = [item.product, ...picked];
  const { cutouts, loading } = useCutouts([
    ...items.map((i) => i.product.imageUrl),
    ...versions.map((p) => p.imageUrl),
  ]);

  const toggle = (id: string) =>
    setPickedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_ALTERNATIVES ? prev : [...prev, id]
    );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-xs font-bold text-slate-800">
          Escolha até {MAX_ALTERNATIVES} alternativas para comparar com o item selecionado
          {loadingVariants && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-[#ee3135]" />}
        </p>
        {candidates.length === 0 && !loadingVariants ? (
          <p className="text-[11px] text-slate-500">
            Sem alternativas ainda. Veja outros produtos (“Adicionar produto”) para compará-los aqui.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {candidates.map(({ product, source }) => {
              const on = pickedIds.includes(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => toggle(product.id)}
                  aria-pressed={on}
                  className={`relative w-28 shrink-0 cursor-pointer rounded-lg border p-1.5 text-left transition ${
                    on ? "border-[#ee3135] bg-red-50" : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                >
                  {on && (
                    <span className="absolute right-1 top-1 rounded-full bg-[#ee3135] p-0.5 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={product.imageUrl} alt={product.name} className="h-16 w-full rounded object-contain" />
                  <span className="mt-1 block truncate text-[11px] font-bold text-slate-800">{product.name}</span>
                  <span className="block text-[10px] text-slate-500">
                    {source} • {formatBRL(product.price)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-3 ${versions.length === 2 ? "sm:grid-cols-2" : versions.length >= 3 ? "lg:grid-cols-3 sm:grid-cols-2" : ""}`}>
        {versions.map((product, idx) => {
          const variantItems = items.map((i) => (i.uid === item.uid ? { ...i, product } : i));
          return (
            <div key={product.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <SceneCanvas
                roomImage={roomImage}
                aspect={aspect}
                items={variantItems}
                cutouts={cutouts}
                cutoutsLoading={loading}
                cmPerPercentX={cmPerPercentX}
                shadow={shadow}
                readOnly
              />
              <div className="flex items-start justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-xs font-bold text-slate-900">{product.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatBRL(product.price)} • {product.dimensions.widthCm} cm de largura
                  </p>
                </div>
                {idx === 0 ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Atual</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onUse(product)}
                    className="shrink-0 cursor-pointer rounded-lg bg-[#19a565] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#13804f]"
                  >
                    Usar esta
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
