"use client";

import { Ruler } from "lucide-react";
import type { RoomMeasurements } from "@/lib/scene-types";

interface FitFilterProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  space: RoomMeasurements;
  onSpaceChange: (space: RoomMeasurements) => void;
  /** Quantos dos produtos listados cabem / total listado */
  fitCount: number;
  totalCount: number;
}

const FIELDS: { key: keyof RoomMeasurements; label: string }[] = [
  { key: "widthCm", label: "Largura" },
  { key: "heightCm", label: "Altura" },
  { key: "depthCm", label: "Profund." },
];

export function FitFilter({ enabled, onToggle, space, onSpaceChange, fitCount, totalCount }: FitFilterProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer min-w-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="w-4 h-4 accent-[#ee3135] shrink-0"
          />
          <Ruler className="w-4 h-4 text-[#ee3135] shrink-0" />
          <span className="truncate">Cabe no meu espaço</span>
        </label>
        <span className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5 shrink-0">
          {fitCount} de {totalCount} cabem
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="text-[10px] font-semibold text-slate-500 min-w-0">
            {label} (cm)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={space[key] || ""}
              onChange={(e) => onSpaceChange({ ...space, [key]: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-0.5 w-full min-w-0 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#ee3135]"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
