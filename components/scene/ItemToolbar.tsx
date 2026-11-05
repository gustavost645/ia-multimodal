"use client";

import React, { useRef, useState } from "react";
import {
  BringToFront,
  Copy,
  FlipHorizontal2,
  Loader2,
  MoreHorizontal,
  Palette,
  Ruler,
  SendToBack,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { BenoitProduct } from "@/data/benoit-catalog";
import type { SceneItem } from "@/lib/scene-types";
import { fetchVariants } from "./useCutout";
import { formatBRL, MAX_ROTATION } from "./geometry";
import { PopoverMenu, type MenuEntry } from "./PopoverMenu";

interface ItemToolbarProps {
  item: SceneItem;
  showUsage: boolean;
  onToggleUsage: () => void;
  onFlip: () => void;
  onFront: () => void;
  onBack: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onSwapProduct: (product: BenoitProduct) => void;
  onScaleChange: (scale: number) => void;
  onRotationChange: (deg: number) => void;
  onUndoReplace?: () => void;
  /** há calibração por foto (escala real) */
  calibrated?: boolean;
  onFitToReplaced?: () => void;
  onMeasure?: () => void;
}

const btn =
  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer";
const btnIdle = "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300";

export function ItemToolbar({
  item,
  showUsage,
  onToggleUsage,
  onFlip,
  onFront,
  onBack,
  onDuplicate,
  onRemove,
  onSwapProduct,
  onScaleChange,
  onRotationChange,
  onUndoReplace,
  calibrated,
  onFitToReplaced,
  onMeasure,
}: ItemToolbarProps) {
  const [colorsOpen, setColorsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<BenoitProduct[] | null>(null);

  const uidRef = useRef(item.uid);
  const openColors = async () => {
    if (colorsOpen) {
      setColorsOpen(false);
      return;
    }
    setColorsOpen(true);
    setLoading(true);
    const requestedUid = uidRef.current;
    const found = await fetchVariants(item.product);
    if (requestedUid !== item.uid) return;
    setVariants(found);
    setLoading(false);
  };

  const moreEntries: MenuEntry[] = [
    { label: item.flipped ? "Espelhar (ativo)" : "Espelhar", icon: <FlipHorizontal2 className="h-4 w-4" />, onSelect: onFlip, active: item.flipped },
    { label: "Trazer para frente", icon: <BringToFront className="h-4 w-4" />, onSelect: onFront },
    { label: "Enviar para trás", icon: <SendToBack className="h-4 w-4" />, onSelect: onBack },
    { label: "Duplicar", icon: <Copy className="h-4 w-4" />, onSelect: onDuplicate },
    {
      label: showUsage ? "Ocultar área de uso" : "Mostrar área de uso",
      icon: <Ruler className="h-4 w-4" />,
      onSelect: onToggleUsage,
      active: showUsage,
    },
  ];
  if (item.replaces && onFitToReplaced && !calibrated) {
    moreEntries.push({
      label: "Ajustar ao tamanho do móvel antigo (aproximado)",
      icon: <Ruler className="h-4 w-4" />,
      onSelect: onFitToReplaced,
    });
  }
  if (item.replaces && onUndoReplace) {
    moreEntries.push({ label: "Desfazer substituição", icon: <Undo2 className="h-4 w-4" />, onSelect: onUndoReplace });
  }

  const oldWidth = item.replaces?.estimatedSizeCm?.widthCm;
  const newWidth = item.product.dimensions.widthCm;
  let compareLine: React.ReactNode = null;
  if (oldWidth && newWidth) {
    const diff = Math.round(newWidth - oldWidth);
    const bigger = diff > 15;
    compareLine = (
      <p
        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
          bigger ? "border-red-200 bg-red-50 text-[#ee3135]" : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}
      >
        Atual: ~{Math.round(oldWidth)} cm · Novo: {Math.round(newWidth)} cm ({diff > 0 ? "+" : ""}
        {diff} cm)
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="truncate text-xs font-bold text-slate-900" title={item.product.name}>
        {item.product.name}
        <span className="ml-1.5 font-normal text-slate-500">• {item.product.dimensions.widthCm} cm de largura</span>
      </p>

      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
          <span className="w-12 shrink-0">Tamanho</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={item.scale}
            onChange={(e) => onScaleChange(Number(e.target.value))}
            className="min-w-0 flex-1 accent-[#ee3135] cursor-pointer"
            aria-label="Tamanho do item"
          />
          <span className="w-10 shrink-0 text-right font-mono text-[#ee3135]">{Math.round(item.scale * 100)}%</span>
        </label>
        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
          <span className="w-12 shrink-0">Girar</span>
          <input
            type="range"
            min={-MAX_ROTATION}
            max={MAX_ROTATION}
            step={1}
            value={item.rotation ?? 0}
            onChange={(e) => onRotationChange(Number(e.target.value))}
            onDoubleClick={() => onRotationChange(0)}
            className="min-w-0 flex-1 accent-[#ee3135] cursor-pointer"
            aria-label="Girar o item (ângulo)"
            title="Arraste para virar o móvel. Duplo clique volta para de frente."
          />
          {(item.rotation ?? 0) !== 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onRotationChange(0);
              }}
              title="Voltar para de frente"
              className="w-10 shrink-0 cursor-pointer text-right font-mono text-[#ee3135] underline"
            >
              {item.rotation}°
            </button>
          ) : (
            <span className="w-10 shrink-0 text-right font-mono text-slate-400">0°</span>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={openColors} className={`${btn} ${colorsOpen ? "border-[#ee3135]/40 bg-red-50 text-[#ee3135]" : btnIdle}`}>
          <Palette className="h-3.5 w-3.5" />
          Trocar cor
        </button>
        <button type="button" onClick={onRemove} className={`${btn} border-red-200 bg-white text-[#ee3135] hover:bg-red-50`}>
          <Trash2 className="h-3.5 w-3.5" />
          Remover
        </button>
        <PopoverMenu
          title="Mais ações do móvel"
          align="left"
          triggerLabel="Mais"
          triggerIcon={<MoreHorizontal className="h-3.5 w-3.5" />}
          triggerClassName={`${btn} ${btnIdle}`}
          entries={moreEntries}
        />
      </div>

      {compareLine}

      {Math.abs(item.scale - 1) > 0.005 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
          Tamanho ajustado à mão — não representa a medida real.
        </p>
      )}
      {!calibrated && (item.replaces || Math.abs(item.scale - 1) > 0.005) && (
        <p className="text-[11px] text-slate-600">
          Para medidas reais, meça pela foto.{" "}
          {onMeasure && (
            <button type="button" onClick={onMeasure} className="cursor-pointer font-bold text-[#ee3135] underline">
              Medir pela foto
            </button>
          )}
        </p>
      )}

      {colorsOpen && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-slate-700">
            <span>Outras cores deste produto</span>
            <button type="button" onClick={() => setColorsOpen(false)} aria-label="Fechar" className="cursor-pointer text-slate-500 hover:text-slate-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {loading ? (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando variações…
            </p>
          ) : variants && variants.filter((v) => v.id !== item.product.id).length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {variants
                .filter((v) => v.id !== item.product.id)
                .map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onSwapProduct(v);
                      setColorsOpen(false);
                    }}
                    className="w-28 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-left hover:border-[#ee3135]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.imageUrl} alt={v.name} className="h-16 w-full rounded object-contain" />
                    <span className="mt-1 block truncate text-[11px] font-bold text-slate-800">{v.color || "Variação"}</span>
                    <span className="block text-[10px] text-slate-500">{formatBRL(v.price)}</span>
                  </button>
                ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Nenhuma outra cor encontrada para este produto.</p>
          )}
        </div>
      )}
    </div>
  );
}
