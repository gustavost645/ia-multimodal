"use client";

import React from "react";
import type { SceneItem } from "@/lib/scene-types";
import type { Cutout } from "@/lib/background-remover";
import {
  FLOOR_FLATTEN,
  getShadowAspect,
  getShadowShiftPercent,
  getUsageArea,
  itemCssTransform,
  rotatedFootprintFactor,
  type ShadowParams,
} from "./geometry";

interface SceneItemViewProps {
  item: SceneItem;
  cutout: Cutout | null | undefined;
  /** largura do item em % da largura da cena */
  widthPct: number;
  selected: boolean;
  showUsage: boolean;
  shadow: ShadowParams;
  interactive: boolean;
}

/** Sombra, área de uso e imagem recortada de um item (posicionado pela base). */
export function SceneItemView({ item, cutout, widthPct, selected, showUsage, shadow, interactive }: SceneItemViewProps) {
  const { product } = item;
  const widthCm = product.dimensions.widthCm || 100;
  const usage = getUsageArea(product);

  // Sombra elíptica sob a base (largura ~ produto, altura ~ profundidade achatada)
  const shadowAspect = getShadowAspect(product);
  const shadowShift = getShadowShiftPercent(shadow.angleDeg, widthPct);
  const footprint = rotatedFootprintFactor(product, item.rotation ?? 0);

  // Faixa da área de uso, à frente da base
  const usageAspect = widthCm / Math.max(5, usage.depthCm * FLOOR_FLATTEN);

  return (
    <>
      {showUsage && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${item.x}%`,
            top: `${item.y}%`,
            width: `${widthPct}%`,
            aspectRatio: `${usageAspect}`,
            transform: "translate(-50%, 0)",
          }}
        >
          <div className="absolute inset-0 rounded-md border border-dashed border-emerald-300/90 bg-emerald-400/30" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-emerald-800 shadow">
            {usage.label}
          </span>
        </div>
      )}

      <div
        className="absolute pointer-events-none"
        style={{
          left: `${item.x + shadowShift}%`,
          top: `${item.y}%`,
          width: `${widthPct * 1.05 * footprint}%`,
          aspectRatio: `${shadowAspect}`,
          transform: "translate(-50%, -55%)",
          background: `radial-gradient(ellipse closest-side at center, rgba(0,0,0,${0.62 * shadow.opacity}) 0%, rgba(0,0,0,${0.3 * shadow.opacity}) 50%, rgba(0,0,0,0) 100%)`,
        }}
      />

      {cutout && (
        <div
          data-uid={interactive ? item.uid : undefined}
          className={`absolute ${interactive ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"} ${
            selected ? "outline outline-2 outline-dashed outline-offset-2 outline-[#ee3135]" : ""
          }`}
          style={{
            left: `${item.x}%`,
            top: `${item.y}%`,
            width: `${widthPct}%`,
            transform: "translate(-50%, -100%)",
            // a perspectiva do giro usa a largura do item (cqw) para ficar igual à imagem exportada
            containerType: "inline-size",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cutout.dataUrl}
            alt={product.name}
            draggable={false}
            className="block w-full h-auto select-none"
            style={{ transform: itemCssTransform(item), transformOrigin: "50% 100%", pointerEvents: "none" }}
          />
        </div>
      )}
    </>
  );
}
