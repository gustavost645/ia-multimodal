"use client";

import React, { useRef, useState } from "react";
import { Ruler, Info, Trash2, Check } from "lucide-react";
import type { PhotoCalibration, PercentPoint } from "@/lib/scene-types";

interface PhotoMeasureToolProps {
  imageSrc: string;
  calibration?: PhotoCalibration;
  onCalibrationChange?: (c: PhotoCalibration | undefined) => void;
  /** Chamado com a largura (cm) medida na linha "espaço livre". */
  onMeasuredWidth?: (widthCm: number) => void;
}

type Line = { a: PercentPoint; b: PercentPoint };
type Mode = "ref" | "space";

const REFERENCES = [
  { key: "door-w", name: "Porta - largura", cm: 80 },
  { key: "door-h", name: "Porta - altura", cm: 210 },
  { key: "a4", name: "Folha A4 (lado maior)", cm: 29.7 },
  { key: "outlet", name: "Tomada/interruptor", cm: 10 },
  { key: "custom", name: "Medida personalizada", cm: 0 },
] as const;

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Comprimento da linha em unidades de "% da largura da imagem". aspect = altura/largura da imagem. */
export function lineLengthPctX(line: Line, aspect: number): number {
  return Math.hypot(line.b.x - line.a.x, (line.b.y - line.a.y) * aspect);
}

function initialRef(calibration?: PhotoCalibration): { key: string; custom: string } {
  if (!calibration) return { key: "door-w", custom: "" };
  const found = REFERENCES.find(
    (r) => r.key !== "custom" && calibration.referenceLabel === `${r.name} (${fmt(r.cm)} cm)`,
  );
  if (found) return { key: found.key, custom: "" };
  return { key: "custom", custom: String(calibration.referenceCm) };
}

interface LoupeState {
  x: number;
  y: number;
  w: number;
  h: number;
}

function Handle({
  point,
  color,
  label,
  containerRef,
  onMove,
  onEnd,
}: {
  point: PercentPoint;
  color: string;
  label: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMove: (p: PercentPoint, rect: DOMRect) => void;
  onEnd: (last: PercentPoint | null) => void;
}) {
  const lastRef = useRef<PercentPoint | null>(null);
  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const p = {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
    lastRef.current = p;
    onMove(p, rect);
  };
  return (
    <div
      role="button"
      aria-label={label}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        handleMove(e);
      }}
      onPointerMove={handleMove}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        const last = lastRef.current;
        lastRef.current = null;
        onEnd(last);
      }}
      onPointerCancel={() => {
        lastRef.current = null;
        onEnd(null);
      }}
      style={{ left: `${point.x}%`, top: `${point.y}%`, touchAction: "none" }}
      className="absolute z-20 w-12 h-12 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing"
    >
      <span
        className="block w-6 h-6 rounded-full border-[3px] border-white shadow-lg"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

export function PhotoMeasureTool({
  imageSrc,
  calibration,
  onCalibrationChange,
  onMeasuredWidth,
}: PhotoMeasureToolProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(0.75); // altura / largura
  const [mode, setMode] = useState<Mode>("ref");
  const [refLine, setRefLine] = useState<Line>(
    calibration?.line ?? { a: { x: 30, y: 60 }, b: { x: 50, y: 60 } },
  );
  const [spaceLine, setSpaceLine] = useState<Line>({ a: { x: 20, y: 82 }, b: { x: 80, y: 82 } });
  const [refKey, setRefKey] = useState(() => initialRef(calibration).key);
  const [customCm, setCustomCm] = useState(() => initialRef(calibration).custom);
  const [loupe, setLoupe] = useState<LoupeState | null>(null);
  const [usedWidth, setUsedWidth] = useState<number | null>(null);

  const preset = REFERENCES.find((r) => r.key === refKey) ?? REFERENCES[0];
  const refCm = refKey === "custom" ? parseFloat(customCm.replace(",", ".")) : preset.cm;
  const refLen = lineLengthPctX(refLine, aspect);
  const refValid = Number.isFinite(refCm) && refCm > 0 && refLen >= 1;
  const cmPerPct = refValid ? refCm / refLen : null;
  const spaceLen = lineLengthPctX(spaceLine, aspect);
  const spaceCm = cmPerPct !== null ? cmPerPct * spaceLen : null;
  const refTooShort = refValid && refLen < 4;

  const buildCalibration = (line: Line, key: string, custom: string): PhotoCalibration | undefined => {
    const p = REFERENCES.find((r) => r.key === key) ?? REFERENCES[0];
    const cm = key === "custom" ? parseFloat(custom.replace(",", ".")) : p.cm;
    const len = lineLengthPctX(line, aspect);
    if (!Number.isFinite(cm) || cm <= 0 || len < 1) return undefined;
    return {
      cmPerPercentX: cm / len,
      referenceLabel: key === "custom" ? `Medida personalizada (${fmt(cm)} cm)` : `${p.name} (${fmt(cm)} cm)`,
      referenceCm: cm,
      line: { a: { ...line.a }, b: { ...line.b } },
    };
  };

  const emit = (line: Line, key: string, custom: string) => {
    onCalibrationChange?.(buildCalibration(line, key, custom));
  };

  const applySpaceWidth = (cm: number) => {
    const rounded = Math.max(1, Math.round(cm));
    setUsedWidth(rounded);
    onMeasuredWidth?.(rounded);
  };

  const moveHandle = (which: Mode, end: "a" | "b") => (p: PercentPoint, rect: DOMRect) => {
    (which === "ref" ? setRefLine : setSpaceLine)((l) => ({ ...l, [end]: p }));
    setLoupe({ x: p.x, y: p.y, w: rect.width, h: rect.height });
    setUsedWidth(null);
  };

  // Recebe o ponto final do arraste, então não depende de estado de render antigo.
  const endDrag = (which: Mode, end: "a" | "b") => (p: PercentPoint | null) => {
    setLoupe(null);
    if (!p) return;
    if (which === "ref") {
      emit({ ...refLine, [end]: p }, refKey, customCm);
    } else if (cmPerPct !== null) {
      applySpaceWidth(cmPerPct * lineLengthPctX({ ...spaceLine, [end]: p }, aspect));
    }
  };

  const showSpace = mode === "space" && cmPerPct !== null;
  const loupeSize = 96;
  const zoom = 3;

  const lineEl = (line: Line, color: string, dashed = false) => (
    <>
      <line
        x1={line.a.x}
        y1={line.a.y}
        x2={line.b.x}
        y2={line.b.y}
        stroke="#fff"
        strokeWidth={6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={line.a.x}
        y1={line.a.y}
        x2={line.b.x}
        y2={line.b.y}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={dashed ? "8 6" : undefined}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );

  const badge = (line: Line, text: string, color: string) => (
    <div
      style={{
        left: `${(line.a.x + line.b.x) / 2}%`,
        top: `${(line.a.y + line.b.y) / 2}%`,
      }}
      className="absolute z-10 -translate-x-1/2 -translate-y-[130%] pointer-events-none px-2 py-0.5 rounded-full text-[11px] font-black text-white shadow-md whitespace-nowrap"
    >
      <span className="absolute inset-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="relative">{text}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold">
        <button
          type="button"
          onClick={() => setMode("ref")}
          className={`py-2 rounded-lg cursor-pointer ${mode === "ref" ? "bg-white text-[#ee3135] shadow-sm" : "text-slate-600"}`}
        >
          1. Referência
        </button>
        <button
          type="button"
          onClick={() => setMode("space")}
          disabled={cmPerPct === null}
          className={`py-2 rounded-lg ${
            mode === "space" ? "bg-white text-[#19a565] shadow-sm" : "text-slate-600"
          } ${cmPerPct === null ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          2. Espaço livre
        </button>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        {mode === "ref"
          ? "Arraste as duas pontas da linha vermelha sobre um objeto de tamanho conhecido (ex.: a largura de uma porta) e escolha qual é."
          : "Arraste as pontas da linha verde de uma ponta à outra do espaço livre na parede, na mesma altura de distância da câmera da referência."}
      </p>

      {/* Foto + linhas */}
      <div
        ref={containerRef}
        className="relative w-full select-none rounded-xl overflow-hidden bg-slate-900 border border-slate-300"
        style={{ touchAction: "pan-y" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="Cômodo para medir"
          draggable={false}
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (w && h) setAspect(h / w);
          }}
          className="block w-full h-auto pointer-events-none"
        />
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {lineEl(refLine, "#ee3135")}
          {showSpace && lineEl(spaceLine, "#19a565", true)}
        </svg>

        {refValid && badge(refLine, `${fmt(refCm)} cm`, "#ee3135")}
        {showSpace && spaceCm !== null && badge(spaceLine, `≈ ${fmt(Math.round(spaceCm))} cm`, "#19a565")}

        {mode === "ref" && (
          <>
            <Handle
              point={refLine.a}
              color="#ee3135"
              label="Ponta inicial da referência"
              containerRef={containerRef}
              onMove={moveHandle("ref", "a")}
              onEnd={endDrag("ref", "a")}
            />
            <Handle
              point={refLine.b}
              color="#ee3135"
              label="Ponta final da referência"
              containerRef={containerRef}
              onMove={moveHandle("ref", "b")}
              onEnd={endDrag("ref", "b")}
            />
          </>
        )}
        {showSpace && (
          <>
            <Handle
              point={spaceLine.a}
              color="#19a565"
              label="Ponta inicial do espaço livre"
              containerRef={containerRef}
              onMove={moveHandle("space", "a")}
              onEnd={endDrag("space", "a")}
            />
            <Handle
              point={spaceLine.b}
              color="#19a565"
              label="Ponta final do espaço livre"
              containerRef={containerRef}
              onMove={moveHandle("space", "b")}
              onEnd={endDrag("space", "b")}
            />
          </>
        )}

        {loupe && (
          <div
            className="absolute z-30 rounded-full border-4 border-white shadow-xl overflow-hidden pointer-events-none bg-slate-900"
            style={{
              width: loupeSize,
              height: loupeSize,
              top: 8,
              ...(loupe.x < 50 ? { right: 8 } : { left: 8 }),
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              className="absolute max-w-none"
              style={{
                left: 0,
                top: 0,
                width: loupe.w * zoom,
                height: loupe.h * zoom,
                transform: `translate(${loupeSize / 2 - (loupe.x / 100) * loupe.w * zoom}px, ${
                  loupeSize / 2 - (loupe.y / 100) * loupe.h * zoom
                }px)`,
              }}
            />
            <span className="absolute left-1/2 top-0 bottom-0 w-px bg-[#ee3135]" />
            <span className="absolute top-1/2 left-0 right-0 h-px bg-[#ee3135]" />
          </div>
        )}
      </div>

      {/* Controles */}
      {mode === "ref" ? (
        <div className="space-y-2">
          <label htmlFor="ref-object" className="text-xs font-bold text-slate-800">
            O que a linha vermelha mede?
          </label>
          <select
            id="ref-object"
            value={refKey}
            onChange={(e) => {
              setRefKey(e.target.value);
              emit(refLine, e.target.value, customCm);
            }}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900"
          >
            {REFERENCES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.key === "custom" ? r.name : `${r.name}: ${fmt(r.cm)} cm`}
              </option>
            ))}
          </select>
          {refKey === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={customCm}
                onChange={(e) => setCustomCm(e.target.value)}
                onBlur={() => emit(refLine, refKey, customCm)}
                placeholder="Medida real"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900"
              />
              <span className="text-xs text-slate-500 font-mono">cm</span>
            </div>
          )}
          {refTooShort && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              A linha está muito curta, e isso reduz a precisão. Prefira uma referência que ocupe boa parte da foto.
            </p>
          )}
          {calibration && (
            <div className="flex items-center justify-between gap-2 text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  Calibrado: {calibration.referenceLabel} (1% da largura ≈ {fmt(calibration.cmPerPercentX)} cm)
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onCalibrationChange?.(undefined);
                  setMode("ref");
                }}
                className="shrink-0 inline-flex items-center gap-1 font-bold text-rose-700 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Remover
              </button>
            </div>
          )}
          {cmPerPct !== null && (
            <button
              type="button"
              onClick={() => {
                emit(refLine, refKey, customCm);
                setMode("space");
              }}
              className="w-full py-2.5 rounded-xl bg-[#ee3135] hover:bg-[#b12124] text-white text-sm font-black cursor-pointer"
            >
              Próximo: medir o espaço livre
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {spaceCm !== null && (
            <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div>
                <div className="text-[11px] text-emerald-800 font-semibold">Largura do espaço livre</div>
                <div className="text-xl font-black text-emerald-900 font-mono">≈ {fmt(Math.round(spaceCm))} cm</div>
              </div>
              <button
                type="button"
                onClick={() => applySpaceWidth(spaceCm)}
                className="px-3 py-2 rounded-xl bg-[#19a565] hover:bg-[#13804e] text-white text-xs font-black cursor-pointer"
              >
                {usedWidth !== null ? "Largura aplicada" : "Usar como largura"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-[#ee3135] shrink-0 mt-0.5" />
        <span>
          <Ruler className="inline w-3 h-3 mr-1 -mt-0.5" />
          A medida vale para objetos na mesma distância da câmera que a referência (por exemplo, na mesma parede).
          Objetos mais perto ou mais longe aparecem com escala diferente. Confira sempre com uma trena.
        </span>
      </div>
    </div>
  );
}
