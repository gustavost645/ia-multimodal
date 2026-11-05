"use client";

import React, { useState } from "react";
import { Sofa, MapPin, Loader2, ScanSearch } from "lucide-react";
import type { DetectedObject } from "@/lib/scene-types";

export interface PinChoice {
  mode: "replace" | "new";
  target?: DetectedObject;
}

interface PinIntentCardProps {
  /** Objetos sob o pin, do menor para o maior (o primeiro é o da frente) */
  objects: DetectedObject[];
  pickIndex: number;
  onPickIndex: (i: number) => void;
  choice: PinChoice | null;
  onReplace: (target: DetectedObject) => void;
  onNew: () => void;
  onChangeChoice: () => void;
}

export function PinIntentCard({
  objects,
  pickIndex,
  onPickIndex,
  choice,
  onReplace,
  onNew,
  onChangeChoice,
}: PinIntentCardProps) {
  const [showOthers, setShowOthers] = useState(false);

  if (choice) {
    return (
      <div
        className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
        role="status"
      >
        <span className="text-slate-800 font-semibold min-w-0 truncate">
          {choice.mode === "replace" && choice.target
            ? `Vai trocar: ${choice.target.label}`
            : "Vai colocar algo novo aqui"}
        </span>
        <button
          type="button"
          onClick={onChangeChoice}
          className="shrink-0 font-bold text-[#ee3135] underline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ee3135] rounded"
        >
          mudar
        </button>
      </div>
    );
  }

  const target = objects[Math.min(pickIndex, objects.length - 1)];
  if (!target) return null;

  return (
    <div
      className="bg-white border border-[#ee3135]/40 rounded-xl p-3 space-y-2 shadow-sm"
      role="group"
      aria-label="O que fazer neste ponto"
    >
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
        <Sofa className="w-4 h-4 text-[#ee3135] shrink-0" />
        <span className="min-w-0">Aqui tem {target.label}. O que deseja fazer?</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onReplace(target)}
          title={`Trocar ${target.label}`}
          className="flex-1 min-w-0 truncate py-2 px-3 rounded-lg bg-[#ee3135] hover:bg-[#b12124] text-white text-xs font-bold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#ee3135]"
        >
          Trocar {target.label}
        </button>
        <button
          type="button"
          onClick={onNew}
          className="flex-1 min-w-0 truncate py-2 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500"
        >
          Colocar algo novo
        </button>
      </div>
      {objects.length > 1 && (
        <div className="text-xs">
          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            aria-expanded={showOthers}
            className="font-bold text-[#ee3135] underline cursor-pointer"
          >
            Não é este? Ver outros
          </button>
          {showOthers && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {objects.map((o, i) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPickIndex(i);
                      setShowOthers(false);
                    }}
                    className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${
                      o.id === target.id
                        ? "bg-[#ee3135] text-white border-[#ee3135]"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function PinStatusChip({
  detecting,
  freeSpace,
  failed,
  canIdentify,
  onRetry,
}: {
  detecting: boolean;
  freeSpace: boolean;
  failed?: boolean;
  canIdentify?: boolean;
  onRetry?: () => void;
}) {
  const link = "font-bold text-[#ee3135] underline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ee3135] rounded";
  if (detecting) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500" role="status">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Analisando o que tem na foto…
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600" role="status">
        <span>Não conseguimos identificar os móveis desta foto agora.</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className={link}>
            Tentar de novo
          </button>
        )}
      </div>
    );
  }
  if (freeSpace) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500" role="status">
        <MapPin className="w-3.5 h-3.5 text-[#ee3135]" />
        Espaço livre
      </div>
    );
  }
  if (canIdentify && onRetry) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ee3135] bg-white text-[#ee3135] hover:bg-[#ee3135]/5 text-xs font-bold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ee3135] focus-visible:ring-offset-2"
        >
          <ScanSearch className="w-3.5 h-3.5" aria-hidden />
          Detectar móveis
        </button>
        <span className="text-[11px] text-slate-500 leading-tight min-w-0">
          Opcional: para <strong>trocar um móvel</strong> da foto.
        </span>
      </div>
    );
  }
  return null;
}

/** Link para voltar ao modo simples (pin sem detecção de móveis). */
export function DisableDetectionLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-[11px] text-slate-500 underline cursor-pointer hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ee3135] rounded"
    >
      Desligar detecção
    </button>
  );
}
