import Image from "next/image";
import { Check, ExternalLink, Images, Info, Ruler } from "lucide-react";
import type { BenoitProduct } from "@/data/benoit-catalog";
import type { FitResult } from "@/lib/fit";
import { FitBadge } from "./FitBadge";

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface ProductCardProps {
  product: BenoitProduct;
  fit?: FitResult | null;
  selected?: boolean;
  /** Texto do botão principal */
  actionLabel: string;
  actionIcon?: React.ReactNode;
  onAction: () => void;
  onInfo?: () => void;
}

export function ProductCard({ product, fit, selected, actionLabel, actionIcon, onAction, onInfo }: ProductCardProps) {
  const d = product.dimensions;
  return (
    <div
      className={`group bg-white border rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-200 min-w-0 ${
        selected
          ? "border-[#ee3135] ring-2 ring-[#ee3135]/30 shadow-md"
          : "border-slate-200 hover:border-[#ee3135] hover:shadow-md"
      }`}
    >
      <div className="relative aspect-[4/3] bg-white border-b border-slate-100 p-2">
        {product.imageUrl && (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
            className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
            referrerPolicy="no-referrer"
          />
        )}
        {product.badge && (
          <span className="absolute top-2 left-2 bg-[#19a565] text-white text-[10px] font-black px-2 py-0.5 rounded">
            {product.badge}
          </span>
        )}
        {(product.images?.length ?? 0) > 1 && (
          <span className="absolute top-2 right-2 bg-white/90 border border-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
            <Images className="w-3 h-3" /> {product.images!.length}
          </span>
        )}
        <div className="absolute bottom-2 right-2 bg-slate-900/80 text-white font-mono text-[10px] px-2 py-0.5 rounded font-bold shadow-sm flex items-center gap-1">
          <Ruler className="w-3 h-3" />
          {d.widthCm} × {d.heightCm} × {d.depthCm} cm
        </div>
        {product.dimensionsSource === "estimada" && (
          <span
            className="absolute bottom-2 left-2 bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded"
            title="A ficha técnica não informa as medidas; valores estimados pelo nome ou pela categoria."
          >
            Medidas estimadas
          </span>
        )}
      </div>

      <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between">
        <div>
          <span className="text-[10px] text-[#b12124] block mb-0.5 font-bold uppercase tracking-wide truncate">
            {product.brand} • {product.categoryLabel}
          </span>
          <h4 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-2 leading-tight">{product.name}</h4>
          <div className="mt-2 text-xs text-slate-600 font-mono">
            {product.originalPrice && <span className="line-through text-slate-400 mr-1.5">{brl(product.originalPrice)}</span>}
            <span className="font-black text-slate-900 text-sm">{brl(product.price)}</span>
          </div>
          <div className="text-[11px] text-[#19a565] font-bold">{product.installment}</div>
          {fit && (
            <div className="mt-2 flex items-start gap-1.5">
              <FitBadge status={fit.status} title={fit.summary} />
              <span className="text-[10px] text-slate-500 leading-tight">{fit.summary}</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onAction}
            className="flex-1 min-w-0 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#ee3135] hover:bg-[#b12124] text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
          >
            {selected ? <Check className="w-3.5 h-3.5" /> : actionIcon}
            <span className="truncate">{selected ? "Selecionado" : actionLabel}</span>
          </button>
          {onInfo && (
            <button
              onClick={onInfo}
              title="Ver ficha técnica completa"
              aria-label="Ver ficha técnica completa"
              className="p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:text-[#ee3135] hover:border-[#ee3135] transition cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver no site da Benoit"
            aria-label="Ver no site da Benoit"
            className="p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:text-[#ee3135] hover:border-[#ee3135] transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
