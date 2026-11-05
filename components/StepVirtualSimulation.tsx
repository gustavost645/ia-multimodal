"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Columns2,
  Download,
  ChevronDown,
  Eraser,
  Hand,
  Undo2,
  MoreHorizontal,
  Ruler,
  ScanSearch,
  Wand2,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Share2,
  SplitSquareHorizontal,
  Sparkles,
} from "lucide-react";
import type { BenoitProduct } from "@/data/benoit-catalog";
import type { DetectedObject, PhotoCalibration, RoomErasure, RoomMeasurements, SceneItem } from "@/lib/scene-types";
import { sameDetectedObject } from "@/lib/boxes";
import { eraseObjects, preloadEraser, type EraseStage } from "@/lib/eraser";
import { PurchasePanel } from "@/components/PurchasePanel";
import { ShareDialog } from "@/components/ShareDialog";
import { AiAnalysisPanel, type AiAnalysis } from "@/components/scene/AiAnalysisPanel";
import { CompareView } from "@/components/scene/CompareView";
import { ItemToolbar } from "@/components/scene/ItemToolbar";
import { PopoverMenu } from "@/components/scene/PopoverMenu";
import { SceneCanvas } from "@/components/scene/SceneCanvas";
import { renderAiPhotoWithBadge, renderSceneToBlob } from "@/components/scene/renderScene";
import { useCutouts } from "@/components/scene/useCutout";
import { detectObjects } from "@/components/scene/detect";
import { GenerateErrorCard } from "@/components/scene/GenerateError";
import { useRealisticPhoto, type GeneratedPhoto } from "@/components/scene/useRealisticPhoto";
import { clampRotation, clampScale, fitScaleToBox, getCmPerPercent, newUid, sceneSignature, type ShadowParams } from "@/components/scene/geometry";

export type { GeneratedPhoto };

const MAX_AI_ITEMS = 6;

interface StepVirtualSimulationProps {
  roomImage: string; // data URL ou URL (Unsplash/vtexassets)
  items: SceneItem[]; // estado vive na página
  onItemsChange: (items: SceneItem[]) => void;
  measurements: RoomMeasurements;
  calibration?: PhotoCalibration; // escala real, vinda da ferramenta "Medir pela foto"
  aiAnalysis: AiAnalysis | null;
  recentProducts: BenoitProduct[]; // produtos vistos recentemente (para comparar)
  onAddProduct: () => void; // abre o seletor para adicionar outro produto
  onBackToMeasurements: () => void;
  onResetAll: () => void;
  onSaveRoom?: () => void; // "Salvar ambiente"
  /** Cliente escolheu um móvel detectado da foto para substituir por um produto Benoit */
  onReplaceObject?: (obj: DetectedObject) => void;
  /** Foto realista gerada (estado elevado na página). Se omitida, o estado é local. */
  aiPhoto?: GeneratedPhoto | null;
  onAiPhotoChange?: (photo: GeneratedPhoto | null) => void;
  /** Móveis já detectados pela página: o modo "Substituir" usa estes e não chama /api/room/detect */
  detectedObjects?: DetectedObject[];
  /** Móveis removidos da foto (estado elevado na página) */
  erasure?: RoomErasure | null;
  onErasureChange?: (erasure: RoomErasure | null) => void;
}

const ERASE_STAGE_TEXT: Record<EraseStage, string> = {
  download: "Preparando a borracha de móveis (na primeira vez baixa ~50 MB)…",
  segment: "Encontrando o contorno dos móveis…",
  inpaint: "Apagando e reconstruindo o fundo…",
  compose: "Finalizando…",
};

type Mode = "edit" | "beforeAfter" | "compare" | "replace";

const modeBtn = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition cursor-pointer";

export function StepVirtualSimulation({
  roomImage,
  items,
  onItemsChange,
  measurements,
  calibration,
  aiAnalysis,
  recentProducts,
  onAddProduct,
  onBackToMeasurements,
  onResetAll,
  onSaveRoom,
  onReplaceObject,
  aiPhoto,
  onAiPhotoChange,
  detectedObjects,
  erasure,
  onErasureChange,
}: StepVirtualSimulationProps) {
  const [mode, setMode] = useState<Mode>("edit");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);
  const [shareOpen, setShareOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detect, setDetect] = useState<{
    for: string;
    status: "loading" | "done";
    objects: DetectedObject[];
    reason?: string;
  } | null>(null);
  /** Móveis da foto selecionados no modo "Trocar ou remover" (vários) */
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [erasing, setErasing] = useState<{ stage: EraseStage } | null>(null);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const eraseSeq = useRef(0);
  const [viewAi, setViewAi] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const photo = useRealisticPhoto(aiPhoto, onAiPhotoChange);

  const shadow: ShadowParams = useMemo(
    () => ({
      opacity: aiAnalysis?.backgroundAnalysis?.shadowOpacity ?? 0.7,
      angleDeg: aiAnalysis?.backgroundAnalysis?.shadowAngleDeg ?? -20,
    }),
    [aiAnalysis]
  );

  const { cmPerPercentX, approximate } = getCmPerPercent(calibration, measurements);
  const { cutouts, loading: cutoutsLoading } = useCutouts(items.map((i) => i.product.imageUrl));

  const selected = items.find((i) => i.uid === selectedUid) ?? null;
  const products = useMemo(() => items.map((i) => i.product), [items]);

  const patchItem = useCallback(
    (uid: string, patch: Partial<SceneItem>) => {
      onItemsChange(items.map((i) => (i.uid === uid ? { ...i, ...patch } : i)));
    },
    [items, onItemsChange]
  );

  const maxZ = items.reduce((m, i) => Math.max(m, i.z), 0);
  const minZ = items.reduce((m, i) => Math.min(m, i.z), 0);

  const duplicate = (item: SceneItem) => {
    const copy: SceneItem = {
      ...item,
      uid: newUid(),
      x: Math.min(100, item.x + 6),
      y: Math.min(100, item.y + 2),
      z: maxZ + 1,
    };
    onItemsChange([...items, copy]);
    setSelectedUid(copy.uid);
  };

  const remove = (item: SceneItem) => {
    onItemsChange(items.filter((i) => i.uid !== item.uid));
    setSelectedUid(null);
  };

  // Móveis removidos da foto: o editor mostra a prévia apagada; a foto realista recebe a original + a lista
  const activeErasure = erasure && erasure.forImage === roomImage && erasure.objects.length > 0 ? erasure : null;
  const sceneImage = activeErasure?.image ?? roomImage;
  const removedObjects = useMemo(() => activeErasure?.objects ?? [], [activeErasure]);

  const signature = useMemo(
    () =>
      sceneSignature(roomImage, items, cmPerPercentX) +
      (removedObjects.length ? "|rm:" + removedObjects.map((o) => `${o.box.x.toFixed(1)},${o.box.y.toFixed(1)}`).join(";") : ""),
    [roomImage, items, cmPerPercentX, removedObjects]
  );
  const aiResult = photo.result;
  const showAi = viewAi && !!aiResult && photo.status === "idle" && mode === "edit";
  const aiOutdated = !!aiResult && aiResult.signature !== signature;
  const needsGenerate = !(aiResult && !aiOutdated);
  const tooManyItems = items.length > MAX_AI_ITEMS;
  const generateBlocked = needsGenerate && (photo.unavailable || tooManyItems);

  const getImageBlob = useCallback(async (): Promise<Blob | null> => {
    if (showAi && aiResult) {
      try {
        return await renderAiPhotoWithBadge(aiResult.image);
      } catch {
        return null;
      }
    }
    try {
      return await renderSceneToBlob({ roomImage: sceneImage, items, cmPerPercentX, shadow });
    } catch (err) {
      console.warn("Falha ao gerar a imagem da simulação:", err);
      return null;
    }
  }, [showAi, aiResult, sceneImage, items, cmPerPercentX, shadow]);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    const blob = await getImageBlob();
    setDownloading(false);
    if (!blob) {
      setError("Não foi possível gerar a imagem agora. Tente novamente.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulacao-benoit-casa-viva.${blob.type.includes("png") ? "png" : "jpg"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const runGenerate = async () => {
    setMode("edit");
    setViewAi(false);
    const ok = await photo.generate({ roomImage, items, removed: removedObjects, cmPerPercentX, shadow, aspect, signature });
    if (ok) setViewAi(true);
  };

  const providedObjects = detectedObjects && detectedObjects.length > 0 ? detectedObjects : null;

  const startReplace = async () => {
    setMode("replace");
    setPickedIds([]);
    setEraseError(null);
    // Os modelos da borracha começam a baixar enquanto o cliente escolhe
    preloadEraser();
    if (providedObjects) return;
    if (detect?.for === roomImage && detect.status === "loading") return;
    if (detect?.for === roomImage && detect.objects.length > 0) return;
    setDetect({ for: roomImage, status: "loading", objects: [] });
    const r = await detectObjects(roomImage);
    setDetect({ for: roomImage, status: "done", objects: r.objects, reason: r.fallbackReason });
  };
  const detectNow: NonNullable<typeof detect> | null = providedObjects
    ? { for: roomImage, status: "done", objects: providedObjects }
    : detect?.for === roomImage
      ? detect
      : null;
  const pickedObjects = (detectNow?.objects ?? []).filter((o) => pickedIds.includes(o.id));
  const isRemoved = (o: DetectedObject) => removedObjects.some((r) => r.id === o.id || sameDetectedObject(r, o));
  const pickedToRemove = pickedObjects.filter((o) => !isRemoved(o));
  const pickedRemoved = pickedObjects.filter(isRemoved);
  const togglePick = (o: DetectedObject) =>
    setPickedIds((prev) => (prev.includes(o.id) ? prev.filter((id) => id !== o.id) : [...prev, o.id]));

  /** Refaz a prévia apagando exatamente `next` (sempre a partir da foto original). */
  const applyRemoval = async (next: DetectedObject[]) => {
    if (!onErasureChange) return;
    const seq = ++eraseSeq.current;
    setEraseError(null);
    if (next.length === 0) {
      onErasureChange(null);
      return true;
    }
    const forImage = roomImage;
    setErasing({ stage: "download" });
    try {
      const image = await eraseObjects(forImage, next, (stage) => {
        if (seq === eraseSeq.current) setErasing({ stage });
      });
      if (seq !== eraseSeq.current) return false;
      onErasureChange({ forImage, objects: next, image });
      return true;
    } catch (err) {
      console.warn("Falha ao remover móveis da foto:", err);
      if (seq === eraseSeq.current) {
        setEraseError("Não foi possível remover os móveis agora. Verifique a conexão e tente de novo.");
      }
      return false;
    } finally {
      if (seq === eraseSeq.current) setErasing(null);
    }
  };

  const removePicked = async () => {
    const ok = await applyRemoval([...removedObjects, ...pickedToRemove]);
    if (ok) {
      setPickedIds([]);
      setMode("edit");
      setViewAi(false);
    }
  };

  const restorePicked = async () => {
    const ok = await applyRemoval(removedObjects.filter((r) => !pickedRemoved.some((p) => p.id === r.id || sameDetectedObject(p, r))));
    if (ok) setPickedIds([]);
  };

  const restoreOne = (obj: DetectedObject) => applyRemoval(removedObjects.filter((r) => r !== obj));

  const compareItem = selected ?? items[0] ?? null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Cabeçalho + ações principais */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 border-l-4 border-l-[#ee3135] bg-white p-4 text-slate-800 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#ee3135]/20 bg-[#ee3135]/10 px-3 py-1 text-xs font-bold text-[#ee3135]">
              <Sparkles className="h-3.5 w-3.5" />
              Simulador Casa Viva Benoit
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Monte seu ambiente</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              Toque num móvel para selecioná-lo, arraste para posicionar e use dois dedos para ajustar o tamanho.
              As proporções seguem as medidas reais de cada produto.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToMeasurements}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Medidas
            </button>
            <button
              type="button"
              onClick={onAddProduct}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#19a565] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#13804f]"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar produto
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading || items.length === 0}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#ee3135] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#b12124] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Baixar imagem
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              disabled={items.length === 0}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Share2 className="h-3.5 w-3.5" />
              Compartilhar
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-xs font-semibold text-[#ee3135]">{error}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
        {/* Esquerda: cena */}
        <div className="min-w-0 space-y-3 lg:col-span-8">
          {/* Ações da cena */}
          <div className="flex flex-wrap items-center gap-2">
            {(mode !== "edit" || viewAi) && (
              <button
                type="button"
                onClick={() => {
                  setMode("edit");
                  setViewAi(false);
                }}
                className={`${modeBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`}
              >
                <Hand className="h-3.5 w-3.5" />
                Voltar ao editor
              </button>
            )}
            {onReplaceObject && (
              <button
                type="button"
                onClick={() => (mode === "replace" ? setMode("edit") : startReplace())}
                className={`${modeBtn} ${mode === "replace" ? "border-[#ee3135] bg-[#ee3135] text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
              >
                <ScanSearch className="h-3.5 w-3.5" />
                Trocar ou remover móveis
              </button>
            )}
            <button
              type="button"
              disabled={(items.length === 0 && removedObjects.length === 0) || photo.status === "loading" || generateBlocked}
              onClick={() => (aiResult && !aiOutdated ? (setMode("edit"), setViewAi(true)) : runGenerate())}
              className={`${modeBtn} border-[#19a565] bg-white text-[#19a565] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {!needsGenerate ? "Ver foto realista" : photo.unavailable ? "Foto realista indisponível" : "Gerar foto realista"}
            </button>
            <PopoverMenu
              title="Mais opções"
              triggerLabel="Mais opções"
              triggerIcon={<MoreHorizontal className="h-3.5 w-3.5" />}
              triggerClassName={`${modeBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`}
              entries={[
                {
                  label: "Antes/depois",
                  hint: "Compare a foto original com a simulação",
                  icon: <SplitSquareHorizontal className="h-4 w-4" />,
                  active: mode === "beforeAfter",
                  onSelect: () => {
                    setViewAi(false);
                    setMode(mode === "beforeAfter" ? "edit" : "beforeAfter");
                  },
                },
                {
                  label: "Comparar produtos",
                  hint: "Veja até 3 alternativas lado a lado",
                  icon: <Columns2 className="h-4 w-4" />,
                  active: mode === "compare",
                  disabled: items.length === 0,
                  onSelect: () => {
                    setViewAi(false);
                    setMode(mode === "compare" ? "edit" : "compare");
                  },
                },
                {
                  label: showUsage ? "Ocultar área de uso" : "Mostrar área de uso",
                  hint: "Espaço livre à frente do móvel",
                  icon: <Ruler className="h-4 w-4" />,
                  active: showUsage,
                  onSelect: () => setShowUsage((v) => !v),
                },
                {
                  label: approximate ? "Medir pela foto (escala aproximada)" : "Refazer medida pela foto",
                  hint: approximate ? "Sem medida, o tamanho na foto é estimado" : "Escala real calibrada",
                  icon: <Ruler className="h-4 w-4" />,
                  onSelect: onBackToMeasurements,
                },
              ]}
            />
          </div>

          {needsGenerate && photo.unavailable && (
            <p className="text-xs text-slate-600">
              A foto realista com IA ainda não está ativada pela loja. O editor, o download e o compartilhamento seguem funcionando.
            </p>
          )}
          {needsGenerate && !photo.unavailable && tooManyItems && (
            <p className="text-xs text-slate-600">A foto realista aceita até {MAX_AI_ITEMS} produtos. Remova alguns para gerar.</p>
          )}

          {photo.status === "loading" && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-slate-800">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-[#19a565]" />
                Gerando a foto realista… {photo.elapsed}s (costuma levar de 10 a 30 segundos)
              </span>
              <button type="button" onClick={photo.cancel} className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">
                Cancelar
              </button>
            </div>
          )}
          {photo.error && <GenerateErrorCard error={photo.error} onDismiss={photo.dismissError} />}

          {mode === "compare" && compareItem ? (
            <>
              <p className="text-xs text-slate-600">
                Comparando alternativas para <strong>{compareItem.product.name}</strong>
                {!selected && items.length > 1 ? " (selecione outro móvel no modo Editar para trocar o item)" : ""}.
              </p>
              <CompareView
                key={compareItem.uid}
                roomImage={sceneImage}
                aspect={aspect}
                items={items}
                item={compareItem}
                recentProducts={recentProducts}
                cmPerPercentX={cmPerPercentX}
                shadow={shadow}
                onUse={(product) => {
                  patchItem(compareItem.uid, { product });
                  setMode("edit");
                  setSelectedUid(compareItem.uid);
                }}
              />
            </>
          ) : mode === "replace" ? (
            <>
              <SceneCanvas
                roomImage={roomImage}
                aspect={aspect}
                onAspect={setAspect}
                items={items}
                cutouts={cutouts}
                cmPerPercentX={cmPerPercentX}
                shadow={shadow}
                detectMode
                detectedObjects={detectNow?.objects}
                activeObjectIds={pickedIds}
                removedObjects={removedObjects}
                onPickObject={togglePick}
              />
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm">
                {erasing ? (
                  <span role="status" className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#ee3135]" />
                    {ERASE_STAGE_TEXT[erasing.stage]}
                  </span>
                ) : !detectNow || detectNow.status === "loading" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#ee3135]" />
                    A IA está identificando os móveis da sua foto…
                  </span>
                ) : detectNow.objects.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{detectNow.reason || "Não encontramos móveis para substituir nesta foto."}</span>
                    <button
                      type="button"
                      onClick={startReplace}
                      className="cursor-pointer rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Tentar de novo
                    </button>
                  </div>
                ) : pickedObjects.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {pickedObjects.length === 1 ? "Selecionado" : `${pickedObjects.length} selecionados`}:{" "}
                        <strong>{pickedObjects.map((o) => o.label).join(", ")}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setPickedIds([])}
                        className="cursor-pointer font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                      >
                        Limpar seleção
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {onErasureChange && pickedToRemove.length > 0 && (
                        <button
                          type="button"
                          onClick={removePicked}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 font-bold text-white hover:bg-slate-700"
                        >
                          <Eraser className="h-3.5 w-3.5" />
                          {pickedToRemove.length === 1 ? "Remover da foto" : `Remover ${pickedToRemove.length} da foto`}
                        </button>
                      )}
                      {onErasureChange && pickedRemoved.length > 0 && (
                        <button
                          type="button"
                          onClick={restorePicked}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-700 hover:bg-slate-100"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          Devolver à foto
                        </button>
                      )}
                      {pickedObjects.length === 1 && (
                        <button
                          type="button"
                          onClick={() => onReplaceObject?.(pickedObjects[0])}
                          className="cursor-pointer rounded-lg bg-[#ee3135] px-3 py-2 font-bold text-white hover:bg-[#b12124]"
                        >
                          Substituir por um produto da Benoit
                        </button>
                      )}
                    </div>
                    {pickedObjects.length > 1 && (
                      <p className="text-[11px] text-slate-500">Para trocar por um produto da Benoit, selecione um móvel por vez.</p>
                    )}
                  </div>
                ) : (
                  <span>
                    Toque nos móveis da foto para selecioná-los. Você pode remover vários de uma vez ou trocar um deles por
                    um produto da Benoit.
                  </span>
                )}
                {eraseError && <p className="mt-2 font-semibold text-[#ee3135]">{eraseError}</p>}
              </div>
            </>
          ) : showAi && aiResult ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setViewAi(false)} className={`${modeBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`}>
                  Editor
                </button>
                <span className={`${modeBtn} border-[#ee3135] bg-[#ee3135] text-white`}>Foto realista (IA)</span>
                <button type="button" onClick={handleDownload} className={`${modeBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`}>
                  <Download className="h-3.5 w-3.5" />
                  Baixar
                </button>
                <button type="button" onClick={() => setShareOpen(true)} className={`${modeBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`}>
                  <Share2 className="h-3.5 w-3.5" />
                  Compartilhar
                </button>
              </div>
              <div className="relative overflow-hidden rounded-2xl border-2 border-slate-300 bg-slate-900 shadow-md" style={{ aspectRatio: `${aspect}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={aiResult.image} alt="Foto realista gerada por IA" className="absolute inset-0 h-full w-full object-contain" />
                <span className="absolute inset-x-2 bottom-2 rounded-lg bg-slate-900/85 px-2.5 py-1.5 text-center text-[11px] font-semibold text-white">
                  Imagem ilustrativa gerada por IA — confira o produto oficial
                </span>
              </div>
              {aiOutdated && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-slate-800">
                  <span>Desatualizada: a cena mudou desde que esta foto foi gerada.</span>
                  <button type="button" onClick={runGenerate} className="cursor-pointer rounded-lg bg-[#19a565] px-3 py-1.5 font-bold text-white hover:bg-[#13804f]">
                    Gerar novamente
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <SceneCanvas
                roomImage={sceneImage}
                beforeImage={roomImage}
                aspect={aspect}
                onAspect={setAspect}
                items={items}
                onItemsChange={onItemsChange}
                selectedUid={selectedUid}
                onSelect={setSelectedUid}
                cutouts={cutouts}
                cutoutsLoading={cutoutsLoading}
                cmPerPercentX={cmPerPercentX}
                approximateScale={approximate}
                scaleBadgeLabel={
                  calibration?.source === "ai-estimate"
                    ? `Escala estimada pela IA (${calibration.referenceLabel})`
                    : undefined
                }
                onMeasure={onBackToMeasurements}
                showUsage={showUsage}
                shadow={shadow}
                beforeAfter={mode === "beforeAfter"}
              />

              {(removedObjects.length > 0 || erasing || eraseError) && mode === "edit" && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm">
                  {erasing ? (
                    <span role="status" className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#ee3135]" />
                      {ERASE_STAGE_TEXT[erasing.stage]}
                    </span>
                  ) : (
                    <>
                      {removedObjects.length > 0 && <span className="font-semibold">Removidos da foto:</span>}
                      {removedObjects.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => restoreOne(o)}
                          title={`Devolver ${o.label} à foto`}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {o.label}
                          <Undo2 className="h-3 w-3" aria-hidden />
                          <span className="sr-only">(devolver à foto)</span>
                        </button>
                      ))}
                      {removedObjects.length > 0 && (
                        <span className="w-full text-[11px] text-slate-500">
                          Prévia feita no seu aparelho. A foto realista com IA refaz o espaço com mais qualidade.
                        </span>
                      )}
                    </>
                  )}
                  {eraseError && <p className="w-full font-semibold text-[#ee3135]">{eraseError}</p>}
                </div>
              )}

              {mode === "beforeAfter" ? (
                <p className="text-xs text-slate-500">Arraste o divisor para comparar a foto original com a simulação.</p>
              ) : selected ? (
                <ItemToolbar
                  key={selected.uid}
                  item={selected}
                  showUsage={showUsage}
                  onToggleUsage={() => setShowUsage((v) => !v)}
                  onFlip={() => patchItem(selected.uid, { flipped: !selected.flipped })}
                  onFront={() => patchItem(selected.uid, { z: maxZ + 1 })}
                  onBack={() => patchItem(selected.uid, { z: minZ - 1 })}
                  onDuplicate={() => duplicate(selected)}
                  onRemove={() => remove(selected)}
                  onSwapProduct={(product) => patchItem(selected.uid, { product })}
                  onScaleChange={(scale) => patchItem(selected.uid, { scale: clampScale(scale) })}
                  onRotationChange={(deg) => patchItem(selected.uid, { rotation: clampRotation(deg) })}
                  onUndoReplace={() => patchItem(selected.uid, { replaces: undefined })}
                  calibrated={!approximate}
                  onMeasure={onBackToMeasurements}
                  onFitToReplaced={
                    selected.replaces
                      ? () =>
                          patchItem(selected.uid, {
                            scale: fitScaleToBox(selected.product, selected.replaces!.box, calibration, measurements),
                          })
                      : undefined
                  }
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
                  <span>
                    {items.length === 0
                      ? "Nenhum produto na cena ainda."
                      : "Toque num móvel para ver as ações. Teclado: setas movem, + e − redimensionam, Delete remove."}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Direita: compra + IA */}
        <div className="min-w-0 space-y-4 lg:col-span-4">
          <PurchasePanel products={products} />

          <div>
            <button
              type="button"
              onClick={() => setAiPanelOpen((v) => !v)}
              aria-expanded={aiPanelOpen}
              className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#ee3135]" />
                {aiPanelOpen ? "Ocultar análise da IA" : "Ver análise da IA"}
              </span>
              <ChevronDown className={`h-4 w-4 transition ${aiPanelOpen ? "rotate-180" : ""}`} />
            </button>
            {aiPanelOpen && (
              <div className="mt-3">
                <AiAnalysisPanel aiAnalysis={aiAnalysis} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-xs">
            {onSaveRoom && (
              <button type="button" onClick={onSaveRoom} className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-slate-600 hover:text-slate-900">
                <Save className="h-3.5 w-3.5 text-[#19a565]" />
                Salvar ambiente
              </button>
            )}
            <button type="button" onClick={onResetAll} className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-slate-500 hover:text-slate-800">
              <RotateCcw className="h-3.5 w-3.5" />
              Recomeçar
            </button>
          </div>
        </div>
      </div>

      <ShareDialog
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        getImageBlob={getImageBlob}
        products={products}
        measurements={measurements}
        aiGenerated={showAi}
      />
    </div>
  );
}
