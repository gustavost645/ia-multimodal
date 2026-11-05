"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Ruler } from "lucide-react";
import type { DetectedObject, SceneItem } from "@/lib/scene-types";
import { sameDetectedObject } from "@/lib/boxes";
import { SceneItemView } from "./SceneItemView";
import type { CutoutMap } from "./useCutout";
import { clampScale, itemWidthPercent, sortByZ, type ShadowParams } from "./geometry";

interface SceneCanvasProps {
  roomImage: string;
  /** foto do lado "Antes" no modo antes/depois (padrão: roomImage) */
  beforeImage?: string;
  /** proporção largura/altura da foto (para o contêiner) */
  aspect: number;
  onAspect?: (aspect: number) => void;
  items: SceneItem[];
  onItemsChange?: (items: SceneItem[]) => void;
  selectedUid?: string | null;
  onSelect?: (uid: string | null) => void;
  cutouts: CutoutMap;
  cutoutsLoading?: boolean;
  cmPerPercentX: number;
  approximateScale?: boolean;
  /** texto do selo de escala aproximada (padrão: "Escala aproximada") */
  scaleBadgeLabel?: string;
  onMeasure?: () => void;
  showUsage?: boolean;
  shadow: ShadowParams;
  /** modo antes/depois: divisor arrastável, itens não editáveis */
  beforeAfter?: boolean;
  /** versão estática (comparação): sem gestos */
  readOnly?: boolean;
  /** modo "Trocar ou remover móveis": mostra as caixas detectadas e desativa a edição */
  detectMode?: boolean;
  detectedObjects?: DetectedObject[];
  /** móveis selecionados (vários) */
  activeObjectIds?: string[];
  /** móveis já removidos da foto (aparecem marcados) */
  removedObjects?: DetectedObject[];
  onPickObject?: (obj: DetectedObject) => void;
  className?: string;
}

interface DragState {
  uid: string;
  dx: number;
  dy: number;
}

interface PinchState {
  uid: string;
  startDist: number;
  startScale: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function SceneCanvas({
  roomImage,
  beforeImage,
  aspect,
  onAspect,
  items,
  onItemsChange,
  selectedUid = null,
  onSelect,
  cutouts,
  cutoutsLoading,
  cmPerPercentX,
  approximateScale,
  scaleBadgeLabel,
  onMeasure,
  showUsage,
  shadow,
  beforeAfter,
  readOnly,
  detectMode,
  detectedObjects,
  activeObjectIds,
  removedObjects,
  onPickObject,
  className,
}: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<DragState | null>(null);
  const pinch = useRef<PinchState | null>(null);
  const bgTap = useRef<{ id: number; x: number; y: number } | null>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const sliderDragging = useRef(false);
  const interactive = !readOnly && !beforeAfter && !detectMode;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const commit = useCallback(
    (next: SceneItem[]) => {
      itemsRef.current = next;
      onItemsChange?.(next);
    },
    [onItemsChange]
  );

  const updateItem = useCallback(
    (uid: string, patch: (it: SceneItem) => Partial<SceneItem>) => {
      commit(itemsRef.current.map((it) => (it.uid === uid ? { ...it, ...patch(it) } : it)));
    },
    [commit]
  );

  const toPercent = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    containerRef.current?.focus({ preventScroll: true });
    containerRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      const el = (e.target as HTMLElement).closest("[data-uid]") as HTMLElement | null;
      const uid = el?.dataset.uid ?? null;
      if (uid) {
        onSelect?.(uid);
        bgTap.current = null;
        const it = itemsRef.current.find((i) => i.uid === uid);
        if (it) {
          const p = toPercent(e.clientX, e.clientY);
          drag.current = { uid, dx: it.x - p.x, dy: it.y - p.y };
        }
      } else {
        bgTap.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    } else if (pointers.current.size === 2 && (drag.current?.uid ?? selectedUid)) {
      bgTap.current = null;
      const target = (drag.current?.uid ?? selectedUid)!;
      const [a, b] = Array.from(pointers.current.values());
      const it = itemsRef.current.find((i) => i.uid === target);
      if (it) {
        pinch.current = {
          uid: target,
          startDist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
          startScale: it.scale,
        };
        drag.current = null;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (bgTap.current && Math.hypot(e.clientX - bgTap.current.x, e.clientY - bgTap.current.y) > 6) {
      bgTap.current = null;
    }

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const { uid, startDist, startScale } = pinch.current;
      const scale = clampScale(startScale * (dist / startDist));
      updateItem(uid, () => ({ scale }));
      return;
    }
    if (drag.current) {
      const p = toPercent(e.clientX, e.clientY);
      const { uid, dx, dy } = drag.current;
      updateItem(uid, () => ({ x: clamp(p.x + dx, 0, 100), y: clamp(p.y + dy, 0, 100) }));
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerup" && bgTap.current?.id === e.pointerId && pointers.current.size === 1) {
      onSelect?.(null);
    }
    if (bgTap.current?.id === e.pointerId) bgTap.current = null;
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    drag.current = null;
  };

  // Roda do mouse sobre um item = redimensiona (listener nativo para poder usar preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      const target = (e.target as HTMLElement).closest("[data-uid]") as HTMLElement | null;
      if (!target?.dataset.uid) return;
      e.preventDefault();
      const uid = target.dataset.uid;
      const factor = Math.exp(-e.deltaY * 0.0015);
      commit(
        itemsRef.current.map((it) => (it.uid === uid ? { ...it, scale: clampScale(it.scale * factor) } : it))
      );
      onSelect?.(uid);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [interactive, commit, onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !selectedUid) return;
    const step = e.shiftKey ? 2 : 0.5;
    switch (e.key) {
      case "ArrowLeft":
        updateItem(selectedUid, (it) => ({ x: clamp(it.x - step, 0, 100) }));
        break;
      case "ArrowRight":
        updateItem(selectedUid, (it) => ({ x: clamp(it.x + step, 0, 100) }));
        break;
      case "ArrowUp":
        updateItem(selectedUid, (it) => ({ y: clamp(it.y - step, 0, 100) }));
        break;
      case "ArrowDown":
        updateItem(selectedUid, (it) => ({ y: clamp(it.y + step, 0, 100) }));
        break;
      case "+":
      case "=":
        updateItem(selectedUid, (it) => ({ scale: clampScale(it.scale + 0.05) }));
        break;
      case "-":
      case "_":
        updateItem(selectedUid, (it) => ({ scale: clampScale(it.scale - 0.05) }));
        break;
      case "Delete":
      case "Backspace":
        commit(itemsRef.current.filter((it) => it.uid !== selectedUid));
        onSelect?.(null);
        break;
      case "Escape":
        onSelect?.(null);
        return;
      default:
        return;
    }
    e.preventDefault();
  };

  // Divisor antes/depois
  const moveSlider = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSliderPos(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
  };

  const ordered = sortByZ(items);

  return (
    <div
      ref={containerRef}
      tabIndex={interactive ? 0 : -1}
      role={interactive ? "application" : "img"}
      aria-label={
        interactive
          ? "Cena do ambiente. Setas movem o móvel selecionado, mais e menos mudam o tamanho, Delete remove."
          : "Pré-visualização do ambiente"
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      style={{ aspectRatio: `${aspect}`, touchAction: interactive && selectedUid ? "none" : interactive || beforeAfter ? "pan-y" : undefined }}
      className={`relative w-full overflow-hidden rounded-2xl bg-slate-900 border-2 border-slate-300 shadow-md select-none outline-none focus-visible:ring-2 focus-visible:ring-[#ee3135] ${className ?? ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={roomImage}
        alt="Ambiente"
        draggable={false}
        onLoad={(e) => {
          const { naturalWidth, naturalHeight } = e.currentTarget;
          if (naturalWidth && naturalHeight) onAspect?.(naturalWidth / naturalHeight);
        }}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
      />

      {/* Móveis da foto que serão substituídos */}
      {!readOnly && !beforeAfter &&
        items
          .filter((it) => it.replaces)
          .map((it) => {
            const b = it.replaces!.box;
            return (
              <div
                key={`rep-${it.uid}`}
                className="absolute pointer-events-none rounded-sm border border-dashed border-white/80"
                style={{
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  width: `${b.w}%`,
                  height: `${b.h}%`,
                  background:
                    "repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 6px, rgba(15,23,42,0.35) 6px 12px)",
                }}
              >
                <span className="absolute left-1 top-1 max-w-[95%] truncate rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {it.replaces!.label} — será substituído
                </span>
              </div>
            );
          })}

      <div className="absolute inset-0">
        {ordered.map((item) => (
          <SceneItemView
            key={item.uid}
            item={item}
            cutout={cutouts[item.product.imageUrl]}
            widthPct={itemWidthPercent(item, cmPerPercentX)}
            selected={interactive && item.uid === selectedUid}
            showUsage={!!showUsage && (!selectedUid || item.uid === selectedUid || readOnly === true) && !beforeAfter}
            shadow={shadow}
            interactive={interactive}
          />
        ))}
      </div>

      {detectMode &&
        [...(detectedObjects ?? [])]
          .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
          .map((obj) => {
          const active = activeObjectIds?.includes(obj.id) ?? false;
          const removed = removedObjects?.some((r) => r.id === obj.id || sameDetectedObject(r, obj)) ?? false;
          return (
            <button
              key={obj.id}
              type="button"
              onClick={() => onPickObject?.(obj)}
              aria-pressed={active}
              aria-label={`${active ? "Desmarcar" : "Selecionar"} ${obj.label}${removed ? " (removido da foto)" : ""}`}
              className={`absolute z-10 cursor-pointer rounded-md border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                active
                  ? "border-[#ee3135] bg-[#ee3135]/25"
                  : removed
                    ? "border-dashed border-amber-300 bg-slate-900/35 hover:bg-slate-900/25"
                    : "border-white/90 bg-white/15 hover:bg-white/30"
              }`}
              style={{ left: `${obj.box.x}%`, top: `${obj.box.y}%`, width: `${obj.box.w}%`, height: `${obj.box.h}%` }}
            >
              <span
                className={`absolute left-0 top-0 max-w-full truncate rounded-br-md px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? "bg-[#ee3135] text-white" : removed ? "bg-amber-300 text-slate-900" : "bg-white text-slate-900"
                }`}
              >
                {active ? "✓ " : ""}
                {obj.label}
                {removed ? " · removido" : ""}
              </span>
            </button>
          );
        })}

      {beforeAfter && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeImage ?? roomImage}
            alt="Ambiente original"
            draggable={false}
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          />
          <span className="absolute top-3 left-3 rounded-lg bg-slate-900/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white pointer-events-none">
            Antes
          </span>
          <span className="absolute top-3 right-3 rounded-lg bg-[#ee3135] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white pointer-events-none">
            Depois
          </span>
          <div
            style={{ left: `${sliderPos}%`, touchAction: "none" }}
            onPointerDown={(e) => {
              sliderDragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => sliderDragging.current && moveSlider(e.clientX)}
            onPointerUp={() => (sliderDragging.current = false)}
            onPointerCancel={() => (sliderDragging.current = false)}
            className="absolute inset-y-0 z-20 flex w-8 -translate-x-1/2 cursor-ew-resize items-center justify-center"
            role="slider"
            aria-label="Divisor antes e depois"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(sliderPos)}
          >
            <div className="absolute inset-y-0 w-1 bg-white shadow-[0_0_12px_rgba(238,49,53,0.8)]" />
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#ee3135] text-white shadow-xl">
              <ChevronLeft className="-mr-1 h-3.5 w-3.5" />
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </>
      )}

      {!readOnly && approximateScale && !beforeAfter && !detectMode && (
        <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow pointer-events-none">
          <Ruler className="h-3 w-3 text-[#ee3135]" />
          {scaleBadgeLabel ?? "Escala aproximada"}
        </div>
      )}

      {cutoutsLoading && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow pointer-events-none">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ee3135]" />
          Recortando produtos…
        </div>
      )}
    </div>
  );
}
