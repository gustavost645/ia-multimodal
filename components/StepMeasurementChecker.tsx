"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Ruler,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Sliders,
  ShieldCheck,
  Camera,
  ChevronDown,
} from "lucide-react";
import { BenoitProduct } from "@/data/benoit-catalog";
import type { PhotoCalibration, RoomMeasurements } from "@/lib/scene-types";
import { PhotoMeasureTool } from "@/components/capture/PhotoMeasureTool";

interface StepMeasurementCheckerProps {
  product: BenoitProduct;
  roomImage: string;
  markerPos: { x: number; y: number };
  initialRoomWidthCm: number;
  initialRoomHeightCm: number;
  initialRoomDepthCm: number;
  onConfirmMeasurements: (measurements: {
    widthCm: number;
    heightCm: number;
    depthCm: number;
  }) => void;
  onBack: () => void;
  isAnalyzingAI: boolean;
  /** Calibração de escala obtida em "Medir pela foto" */
  calibration?: PhotoCalibration;
  onCalibrationChange?: (c: PhotoCalibration | undefined) => void;
  /** Chamada sempre que o usuário edita largura/altura/profundidade (campos ou "Medir pela foto"). */
  onMeasurementsChange?: (m: RoomMeasurements) => void;
}

/** Veredito calculado localmente a partir das medidas (não depende da IA). */
function computeVerdict(diffW: number, diffH: number, diffD: number, valid: boolean) {
  if (!valid || diffW < 0 || diffH < 0 || diffD < 0) return "exceeds" as const;
  if (diffW < 15 || diffD < 15 || diffH < 10) return "tight" as const;
  return "optimal" as const;
}

export function StepMeasurementChecker({
  product,
  roomImage,
  markerPos,
  initialRoomWidthCm,
  initialRoomHeightCm,
  initialRoomDepthCm,
  onConfirmMeasurements,
  onBack,
  isAnalyzingAI,
  calibration,
  onCalibrationChange,
  onMeasurementsChange,
}: StepMeasurementCheckerProps) {
  const [localCalibration, setLocalCalibration] = useState<PhotoCalibration | undefined>(calibration);
  const [showMeasureTool, setShowMeasureTool] = useState(!!calibration);
  const [measuredNote, setMeasuredNote] = useState<number | null>(null);
  const activeCalibration = onCalibrationChange ? calibration : localCalibration;
  const handleCalibration = (c: PhotoCalibration | undefined) => {
    setLocalCalibration(c);
    onCalibrationChange?.(c);
  };

  const [roomWidth, setRoomWidth] = useState(initialRoomWidthCm);
  const [roomHeight, setRoomHeight] = useState(initialRoomHeightCm);
  const [roomDepth, setRoomDepth] = useState(initialRoomDepthCm);
  const [includeOpenClearance, setIncludeOpenClearance] = useState(true);
  const [userEdited, setUserEdited] = useState(false);
  const [prevInitial, setPrevInitial] = useState([initialRoomWidthCm, initialRoomHeightCm, initialRoomDepthCm]);

  // Sincroniza com as props enquanto o usuário não editou nada (derivado durante a renderização).
  if (
    prevInitial[0] !== initialRoomWidthCm ||
    prevInitial[1] !== initialRoomHeightCm ||
    prevInitial[2] !== initialRoomDepthCm
  ) {
    setPrevInitial([initialRoomWidthCm, initialRoomHeightCm, initialRoomDepthCm]);
    if (!userEdited) {
      setRoomWidth(initialRoomWidthCm);
      setRoomHeight(initialRoomHeightCm);
      setRoomDepth(initialRoomDepthCm);
    }
  }

  const editMeasure = (key: "widthCm" | "heightCm" | "depthCm", value: number) => {
    const next: RoomMeasurements = { widthCm: roomWidth, heightCm: roomHeight, depthCm: roomDepth, [key]: value };
    if (key === "widthCm") setRoomWidth(value);
    else if (key === "heightCm") setRoomHeight(value);
    else setRoomDepth(value);
    setUserEdited(true);
    onMeasurementsChange?.(next);
  };

  // Dimension comparisons
  const prodW = product.dimensions.widthCm;
  const prodH = product.dimensions.heightCm;
  const prodD = includeOpenClearance && product.dimensions.openDepthCm
    ? product.dimensions.openDepthCm
    : product.dimensions.depthCm;

  const diffW = roomWidth - prodW;
  const diffH = roomHeight - prodH;
  const diffD = roomDepth - prodD;

  // Determine Traffic Light Status
  const fitsWidth = diffW >= 0;
  const fitsHeight = diffH >= 0;
  const fitsDepth = diffD >= 0;

  const measuresValid = [roomWidth, roomHeight, roomDepth].every((v) => Number.isFinite(v) && v > 0);
  const overallStatus: "optimal" | "tight" | "exceeds" = computeVerdict(diffW, diffH, diffD, measuresValid);

  const handleProceed = () => {
    onConfirmMeasurements({
      widthCm: roomWidth,
      heightCm: roomHeight,
      depthCm: roomDepth,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 border-l-4 border-l-[#ee3135] rounded-2xl p-5 sm:p-6 text-slate-800 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#ee3135]/10 text-[#ee3135] border border-[#ee3135]/20 mb-2">
              <Ruler className="w-3.5 h-3.5" />
              Passo 3 (Parte 1): Verificação de Medidas
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              Conferir Medidas: O produto cabe no seu espaço?
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl mt-1 leading-relaxed">
              Comparamos as medidas oficiais da ficha técnica com o vão do seu cômodo.
              Você pode ajustar os valores com a sua trena física para máxima segurança.
            </p>
          </div>

          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold transition cursor-pointer self-start md:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Trocar Produto
          </button>
        </div>
      </div>

      {/* Medir pela foto */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <button
          type="button"
          onClick={() => setShowMeasureTool((v) => !v)}
          aria-expanded={showMeasureTool}
          className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left cursor-pointer"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Camera className="w-4 h-4 text-[#ee3135] shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900">Medir pela foto</span>
              <span className="block text-xs text-slate-500">
                {activeCalibration
                  ? `Calibrado com: ${activeCalibration.referenceLabel}`
                  : "Use uma porta ou folha A4 como referência para estimar o espaço."}
              </span>
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${showMeasureTool ? "rotate-180" : ""}`} />
        </button>
        {showMeasureTool && (
          <div className="px-4 pb-4 sm:px-5 sm:pb-5 max-w-2xl">
            <PhotoMeasureTool
              imageSrc={roomImage}
              calibration={activeCalibration}
              onCalibrationChange={handleCalibration}
              onMeasuredWidth={(cm) => {
                editMeasure("widthCm", cm);
                setMeasuredNote(cm);
              }}
            />
            {measuredNote !== null && (
              <p className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                Largura do espaço preenchida com {measuredNote} cm. Você ainda pode ajustar abaixo.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Main Grid: Status Diagnostics + Interactive Dimension Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Traffic Light Card & Visual Summary (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Main Status Card */}
          <div
            className={`rounded-2xl p-5 border text-slate-800 shadow-sm transition-all ${
              overallStatus === "optimal"
                ? "bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-400/20"
                : overallStatus === "tight"
                ? "bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20"
                : "bg-rose-50/90 border-rose-300 ring-2 ring-rose-400/20"
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm text-white ${
                  overallStatus === "optimal"
                    ? "bg-[#19a565]"
                    : overallStatus === "tight"
                    ? "bg-[#faa634]"
                    : "bg-[#ee3135]"
                }`}
              >
                {overallStatus === "optimal" && <CheckCircle2 className="w-7 h-7" />}
                {overallStatus === "tight" && <AlertTriangle className="w-7 h-7" />}
                {overallStatus === "exceeds" && <XCircle className="w-7 h-7" />}
              </div>

              <div>
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    overallStatus === "optimal"
                      ? "text-emerald-700"
                      : overallStatus === "tight"
                      ? "text-amber-800"
                      : "text-rose-700"
                  }`}
                >
                  Diagnóstico de Viabilidade
                </span>
                <h3 className="text-lg font-black tracking-tight text-slate-900 mt-0.5">
                  {overallStatus === "optimal" && "CABE COM FOLGA ADEQUADA"}
                  {overallStatus === "tight" && "CABE NO LIMITE (ATENÇÃO)"}
                  {overallStatus === "exceeds" && "NÃO CABE NO ESPAÇO ATUAL"}
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-700 mt-3 leading-relaxed">
              {overallStatus === "optimal" &&
                `O espaço no cômodo possui margem de folga de +${diffW}cm na largura e +${diffD}cm de profundidade, garantindo circulação confortável e fácil montagem.`}
              {overallStatus === "tight" &&
                `O produto cabe fisicamente, porém a folga é justa (${diffW < 15 ? `apenas +${diffW}cm de largura` : `apenas +${diffD}cm de profundidade`}). Verifique se gavetas e portas poderão ser abertas livremente.`}
              {overallStatus === "exceeds" &&
                `Atenção: O produto excede o espaço medido (${!measuresValid ? "preencha todas as medidas com valores maiores que zero" : [!fitsWidth && `falta ${Math.abs(diffW)}cm na largura`, !fitsHeight && `falta ${Math.abs(diffH)}cm na altura`, !fitsDepth && `falta ${Math.abs(diffD)}cm na profundidade`].filter(Boolean).join(", ")}). Considere reposicionar ou escolher outro modelo.`}
            </p>

            {/* Product summary snippet */}
            <div className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-white border border-slate-200 shrink-0">
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  className="object-contain p-1"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">{product.name}</h4>
                <div className="text-[11px] text-[#ee3135] font-bold font-mono">
                  Benoit: {product.dimensions.widthCm}cm × {product.dimensions.heightCm}cm × {product.dimensions.depthCm}cm
                </div>
              </div>
            </div>
          </div>

          {/* Clearance & Safety Card */}
          {product.clearanceRequirements?.warningNote && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-[#ee3135] font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Requisito de Instalação Benoit:</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                {product.clearanceRequirements.warningNote}
              </p>
            </div>
          )}

          {/* Open Depth Toggle if Applicable */}
          {product.dimensions.openDepthCm && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between text-xs text-slate-700 shadow-sm">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900">Considerar aberto/reclinado</div>
                <div className="text-slate-500 text-[11px]">
                  Profundidade estendida: {product.dimensions.openDepthCm} cm
                </div>
              </div>
              <button
                onClick={() => setIncludeOpenClearance(!includeOpenClearance)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  includeOpenClearance ? "bg-[#ee3135]" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    includeOpenClearance ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Dimension Inputs & Bar Meters (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#ee3135]" />
                <span>Comparador de Medidas (Cômodo vs. Produto)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Valores calculados por IA ou ajustados por você com a sua trena.
              </p>
            </div>
            {isAnalyzingAI && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#ee3135] animate-pulse font-mono font-bold">
                <Sparkles className="w-3.5 h-3.5 text-[#faa634]" />
                IA Analisando...
              </span>
            )}
          </div>

          {/* Dimension 1: Largura (Width) */}
          <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ee3135]" />
                LARGURA DISPONÍVEL (Vão da Parede)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Produto: {prodW} cm</span>
                <span
                  className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                    fitsWidth ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {fitsWidth ? `+${diffW}cm folga` : `${diffW}cm falta`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50"
                max="400"
                value={roomWidth}
                onChange={(e) => editMeasure("widthCm", Number(e.target.value))}
                className="flex-1 accent-[#ee3135] cursor-pointer"
              />
              <div className="flex items-center gap-1 bg-white border border-slate-300 px-3 py-1.5 rounded-lg shadow-sm">
                <input
                  type="number"
                  value={roomWidth}
                  onChange={(e) => editMeasure("widthCm", Number(e.target.value))}
                  className="w-14 bg-transparent text-right font-mono text-xs font-bold text-slate-900 focus:outline-none"
                />
                <span className="text-xs text-slate-500 font-mono">cm</span>
              </div>
            </div>

            {/* Visual Bar Comparison */}
            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${Math.min(100, (prodW / roomWidth) * 100)}%` }}
                className={`h-full ${fitsWidth ? "bg-slate-800" : "bg-[#ee3135]"}`}
              />
              {fitsWidth && (
                <div
                  style={{ width: `${Math.max(0, (diffW / roomWidth) * 100)}%` }}
                  className="h-full bg-[#19a565]/40"
                  title="Folga de circulação"
                />
              )}
            </div>
          </div>

          {/* Dimension 2: Altura (Height) */}
          <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                ALTURA DISPONÍVEL (Pé-Direito / Nicho)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Produto: {prodH} cm</span>
                <span
                  className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                    fitsHeight ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {fitsHeight ? `+${diffH}cm folga` : `${diffH}cm falta`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50"
                max="320"
                value={roomHeight}
                onChange={(e) => editMeasure("heightCm", Number(e.target.value))}
                className="flex-1 accent-slate-700 cursor-pointer"
              />
              <div className="flex items-center gap-1 bg-white border border-slate-300 px-3 py-1.5 rounded-lg shadow-sm">
                <input
                  type="number"
                  value={roomHeight}
                  onChange={(e) => editMeasure("heightCm", Number(e.target.value))}
                  className="w-14 bg-transparent text-right font-mono text-xs font-bold text-slate-900 focus:outline-none"
                />
                <span className="text-xs text-slate-500 font-mono">cm</span>
              </div>
            </div>

            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${Math.min(100, (prodH / roomHeight) * 100)}%` }}
                className={`h-full ${fitsHeight ? "bg-slate-700" : "bg-[#ee3135]"}`}
              />
              {fitsHeight && (
                <div
                  style={{ width: `${Math.max(0, (diffH / roomHeight) * 100)}%` }}
                  className="h-full bg-[#19a565]/40"
                />
              )}
            </div>
          </div>

          {/* Dimension 3: Profundidade (Depth) */}
          <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#faa634]" />
                PROFUNDIDADE DISPONÍVEL (Avanço no Piso)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Produto: {prodD} cm</span>
                <span
                  className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                    fitsDepth ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {fitsDepth ? `+${diffD}cm folga` : `${diffD}cm falta`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min="30"
                max="250"
                value={roomDepth}
                onChange={(e) => editMeasure("depthCm", Number(e.target.value))}
                className="flex-1 accent-[#faa634] cursor-pointer"
              />
              <div className="flex items-center gap-1 bg-white border border-slate-300 px-3 py-1.5 rounded-lg shadow-sm">
                <input
                  type="number"
                  value={roomDepth}
                  onChange={(e) => editMeasure("depthCm", Number(e.target.value))}
                  className="w-14 bg-transparent text-right font-mono text-xs font-bold text-slate-900 focus:outline-none"
                />
                <span className="text-xs text-slate-500 font-mono">cm</span>
              </div>
            </div>

            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${Math.min(100, (prodD / roomDepth) * 100)}%` }}
                className={`h-full ${fitsDepth ? "bg-[#faa634]" : "bg-[#ee3135]"}`}
              />
              {fitsDepth && (
                <div
                  style={{ width: `${Math.max(0, (diffD / roomDepth) * 100)}%` }}
                  className="h-full bg-[#19a565]/40"
                />
              )}
            </div>
          </div>

          {/* Confirm & Proceed Button in Benoit Red */}
          <div className="pt-2 flex gap-3">
            <button
              onClick={handleProceed}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#ee3135] hover:bg-[#b12124] text-white font-bold text-sm whitespace-nowrap shadow-sm transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>Ver simulação no cômodo</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
