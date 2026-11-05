"use client";

import React from "react";
import { Sparkles, Sun, Palette, ShieldCheck } from "lucide-react";

export interface AiAnalysis {
  roomType?: string;
  floorType?: string;
  lightingDescription?: string;
  backgroundAnalysis?: {
    lightSourceLocation: string;
    lightTemperature: string;
    floorPlaneAngleDeg: number;
    shadowDirection: string;
    shadowAngleDeg: number;
    shadowBlurPx: number;
    shadowOpacity: number;
    detectedObstacles: string[];
  };
  fitStatus?: string;
  fitSummary?: string;
  designTips?: string;
  ergonomicWarnings?: string[];
  colorHarmonyScore?: number;
  perspectiveAngleDeg?: number;
  recommendedScaleFactor?: number;
}

export function AiAnalysisPanel({ aiAnalysis }: { aiAnalysis: AiAnalysis | null }) {
  const ba = aiAnalysis?.backgroundAnalysis;
  return (
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#ee3135]" />
                <span>IA: Análise do Fundo & Objeto</span>
              </h4>
              {aiAnalysis?.colorHarmonyScore && (
                <span className="bg-emerald-50 text-[#19a565] border border-emerald-200 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold">
                  {aiAnalysis.colorHarmonyScore}% Harmonia
                </span>
              )}
            </div>

            {/* Background lighting & shadow vector report */}
            <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold text-[11px]">
                <Sun className="w-3.5 h-3.5 text-[#ee3135]" />
                <span>Iluminação e Sombra do Cômodo:</span>
              </div>
              <p className="text-slate-700 text-[11px] leading-relaxed">
                {ba?.lightSourceLocation || "Não informado"}
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 text-[10px] text-slate-500 font-mono">
                <div>
                  <span>Sombra Projetada:</span>{" "}
                  <span className="text-[#ee3135] font-bold">{ba ? `${ba.shadowAngleDeg}°` : "—"}</span>
                </div>
                <div>
                  <span>Piso / Perspectiva:</span>{" "}
                  <span className="text-slate-800 font-bold">{ba ? `${ba.floorPlaneAngleDeg}°` : "—"}</span>
                </div>
              </div>
            </div>

            {/* Room type & flooring */}
            <div className="space-y-1.5 text-slate-700">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Cômodo:</span>
                <span className="font-semibold text-slate-900">{aiAnalysis?.roomType || "—"}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Piso Identificado:</span>
                <span className="font-semibold text-slate-900">{aiAnalysis?.floorType || "—"}</span>
              </div>
            </div>

            {/* AI Fit Summary */}
            {aiAnalysis?.fitSummary && (
              <div className="p-3 bg-red-50/50 rounded-xl border border-red-100 text-[11px] text-slate-700 leading-relaxed">
                <strong className="text-[#ee3135] block mb-1">Diagnóstico de Espaço:</strong>
                {aiAnalysis.fitSummary}
              </div>
            )}

            {/* Design Tips */}
            {aiAnalysis?.designTips && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-800 font-bold text-[11px]">
                  <Palette className="w-3.5 h-3.5 text-[#ee3135]" />
                  <span>Harmonização de Cores & Estilo:</span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  {aiAnalysis.designTips}
                </p>
              </div>
            )}

            {/* Obstacles or Ergonomic Warnings */}
            {((aiAnalysis?.backgroundAnalysis?.detectedObstacles && aiAnalysis.backgroundAnalysis.detectedObstacles.length > 0) ||
              (aiAnalysis?.ergonomicWarnings && aiAnalysis.ergonomicWarnings.length > 0)) && (
              <div className="space-y-1 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-800 font-bold text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#ee3135]" />
                  <span>Pontos de Atenção na Instalação:</span>
                </div>
                <ul className="space-y-1 text-slate-600 text-[10px] list-disc list-inside">
                  {aiAnalysis?.backgroundAnalysis?.detectedObstacles?.map((obs, i) => (
                    <li key={`obs-${i}`} className="text-[#ee3135]">Fundo: {obs}</li>
                  ))}
                  {aiAnalysis?.ergonomicWarnings?.map((warn, i) => (
                    <li key={`warn-${i}`}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
  );
}
