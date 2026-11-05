"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import {
  Camera,
  Upload,
  Sparkles,
  MapPin,
  Eye,
  Grid,
  CheckCircle2,
  Info,
  ArrowRight,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { SAMPLE_ROOMS, RoomSample } from "@/data/benoit-catalog";
import type { SavedRoom, DetectedObject, PinIntent } from "@/lib/scene-types";
import { DisableDetectionLink, PinIntentCard, PinStatusChip } from "@/components/capture/PinIntentCard";
import { analyzePhotoQuality } from "@/lib/photo-quality";
import { downscaleImage } from "@/lib/saved-rooms";
import { PhotoGuide } from "@/components/capture/PhotoGuide";
import { SavedRoomsPanel } from "@/components/capture/SavedRoomsPanel";

interface StepRoomCaptureProps {
  roomImage: string | null;
  markerPos: { x: number; y: number };
  onSelectImage: (imageUrl: string, sampleData?: RoomSample) => void;
  onSetMarkerPos: (pos: { x: number; y: number }) => void;
  onNext: () => void;
  /** Problemas na foto apontados pela IA (exibidos junto dos avisos locais). */
  aiPhotoIssues?: string[];
  /** Se informado, mostra "Meus ambientes" e chama ao abrir um ambiente salvo. */
  onLoadSavedRoom?: (room: SavedRoom) => void;
  /** Móveis detectados na foto pela IA (undefined = ainda analisando; [] = nada detectado). */
  detectedObjects?: DetectedObject[];
  isDetecting?: boolean;
  /** A IA falhou ao identificar os móveis desta foto. */
  detectionFailed?: boolean;
  /** Botão "Detectar móveis da foto" (liga a detecção) e "Tentar de novo" */
  onRetryDetection?: () => void;
  /** Se informado, mostra "Desligar detecção de móveis" quando a detecção está ligada */
  onDisableDetection?: () => void;
  pinIntent?: PinIntent | null;
  onPinIntentChange?: (intent: PinIntent | null) => void;
}

export function StepRoomCapture({
  roomImage,
  markerPos,
  onSelectImage,
  onSetMarkerPos,
  onNext,
  aiPhotoIssues,
  onLoadSavedRoom,
  detectedObjects,
  isDetecting,
  detectionFailed,
  onRetryDetection,
  onDisableDetection,
  onPinIntentChange,
}: StepRoomCaptureProps) {
  const [choice, setChoice] = useState<{ key: string; mode: "replace" | "new"; target?: DetectedObject } | null>(null);
  const [pick, setPick] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [pending, setPending] = useState<{ url: string; issues: string[] } | null>(null);
  const [dismissedAi, setDismissedAi] = useState<string | null>(null);
  const [imgAspect, setImgAspect] = useState(4 / 3); // largura / altura da foto
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const original = event.target?.result;
      input.value = "";
      if (typeof original !== "string") return;
      setAnalyzing(true);
      try {
        const report = await analyzePhotoQuality(original);
        const issues = report?.issues.map((i) => i.message) ?? [];
        const url = await downscaleImage(original, 1600);
        if (issues.length > 0) {
          setPending({ url, issues });
        } else {
          setPending(null);
          onSelectImage(url);
        }
      } catch {
        onSelectImage(original);
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const aiKey = aiPhotoIssues?.join("|") ?? "";
  const showAiIssues = !!aiPhotoIssues?.length && dismissedAi !== aiKey;

  // Objetos sob o pin, do menor para o maior (o da frente primeiro)
  const underPin = (detectedObjects ?? [])
    .filter(
      (o) =>
        markerPos.x >= o.box.x &&
        markerPos.x <= o.box.x + o.box.w &&
        markerPos.y >= o.box.y &&
        markerPos.y <= o.box.y + o.box.h,
    )
    .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h);
  const choiceKey = `${markerPos.x},${markerPos.y}|${underPin.map((o) => o.id).join(",")}`;
  const activeChoice = choice && choice.key === choiceKey ? choice : null;
  const candidate = underPin[Math.min(pick, Math.max(0, underPin.length - 1))];
  const outlined = activeChoice?.mode === "replace" ? activeChoice.target : underPin.length ? candidate : undefined;
  const detecting = !!roomImage && isDetecting === true;
  const failed = !!roomImage && !detecting && detectionFailed === true;
  const freeSpace = !!roomImage && !detecting && !failed && detectedObjects !== undefined && underPin.length === 0;
  const canIdentify = !!roomImage && !detecting && !failed && detectedObjects === undefined && !!onRetryDetection;

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onSetMarkerPos({
      x: Math.max(5, Math.min(95, Math.round(x))),
      y: Math.max(10, Math.min(95, Math.round(y))),
    });
    // Reavalia a intenção: padrão "new" até o cliente escolher "Trocar"
    setChoice(null);
    setPick(0);
    onPinIntentChange?.({ mode: "new" });
  };

  return (
    <div className="space-y-6">
      {/* Hero explanation in Benoit clean white & red */}
      <div className="bg-white border border-slate-200 border-l-4 border-l-[#ee3135] rounded-2xl p-5 sm:p-6 text-slate-800 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#ee3135]/10 text-[#ee3135] border border-[#ee3135]/20 mb-2">
              <Camera className="w-3.5 h-3.5" />
              Passo 1 de 3: Ambiente Real
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              Fotografe ou selecione o cômodo da sua casa
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl mt-1 leading-relaxed">
              Fotografe a sala, quarto, cozinha ou área onde você quer posicionar o produto da Benoit.
              Depois, dê um toque na tela para apontar o local exato.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Hidden file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#ee3135] hover:bg-[#b12124] text-white font-bold text-xs whitespace-nowrap shadow-sm transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              Tirar foto
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs whitespace-nowrap transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Enviar da galeria
            </button>
          </div>
        </div>
      </div>

      {analyzing && (
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-xl p-3">
          <Loader2 className="w-4 h-4 animate-spin text-[#ee3135]" />
          Verificando a qualidade da foto...
        </div>
      )}

      {pending && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-3" role="alert">
          <div className="flex items-center gap-2 text-sm font-black text-amber-900">
            <AlertTriangle className="w-4 h-4" />
            Essa foto pode atrapalhar a simulação
          </div>
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.url} alt="Foto escolhida" className="w-24 h-20 object-cover rounded-lg border border-amber-200 shrink-0" />
            <ul className="space-y-1 text-xs text-amber-900 list-disc list-inside min-w-0">
              {pending.issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setPending(null);
                cameraInputRef.current?.click();
              }}
              className="flex-1 py-2 rounded-lg bg-[#ee3135] hover:bg-[#b12124] text-white text-xs font-black cursor-pointer"
            >
              Tirar outra
            </button>
            <button
              onClick={() => {
                onSelectImage(pending.url);
                setPending(null);
              }}
              className="flex-1 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold cursor-pointer"
            >
              Usar mesmo assim
            </button>
          </div>
        </div>
      )}

      {!pending && showAiIssues && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-2" role="status">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-black text-amber-900">
              <Sparkles className="w-4 h-4" />
              A IA notou na sua foto
            </div>
            <button
              onClick={() => setDismissedAi(aiKey)}
              className="text-[11px] font-bold text-amber-900 underline cursor-pointer"
            >
              Entendi
            </button>
          </div>
          <ul className="space-y-1 text-xs text-amber-900 list-disc list-inside">
            {aiPhotoIssues!.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="text-xs font-bold text-[#ee3135] underline cursor-pointer"
          >
            Tirar outra foto
          </button>
        </div>
      )}

      {/* Main workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Room Preview and Placement Target (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs sm:text-sm">
            <div className="flex flex-wrap items-center gap-2 font-bold text-slate-800">
              <Eye className="w-4 h-4 text-[#ee3135]" />
              <span>Visor do Ambiente</span>
              {roomImage && (
                <span className="hidden sm:inline text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md font-mono font-semibold">
                  Posição: X {markerPos.x}% | Y {markerPos.y}%
                </span>
              )}
            </div>

            {roomImage && (
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  showGrid
                    ? "bg-[#ee3135]/10 text-[#ee3135] border border-[#ee3135]/30"
                    : "text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Guias de Piso</span>
              </button>
            )}
          </div>

          {/* Interactive photo area */}
          <div
            onClick={roomImage ? handleImageClick : undefined}
            style={
              roomImage
                ? { aspectRatio: String(imgAspect), width: `min(100%, calc(70vh * ${imgAspect}))` }
                : undefined
            }
            className={`relative mx-auto w-full rounded-xl overflow-hidden bg-slate-900 ${
              roomImage
                ? "ring-2 ring-slate-300 cursor-crosshair group shadow-inner"
                : "border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-8 text-center bg-slate-50 aspect-[4/3] sm:aspect-[16/10]"
            }`}
          >
            {roomImage ? (
              <>
                <Image
                  src={roomImage}
                  alt="Cômodo do usuário"
                  fill
                  onLoad={(e) => {
                    const t = e.currentTarget;
                    if (t.naturalWidth && t.naturalHeight) setImgAspect(t.naturalWidth / t.naturalHeight);
                  }}
                  className="object-fill select-none pointer-events-none"
                  referrerPolicy="no-referrer"
                  priority
                />

                {/* Perspective floor guide lines overlay */}
                {showGrid && (
                  <div className="absolute inset-0 pointer-events-none">
                    <svg className="w-full h-full opacity-40" preserveAspectRatio="none">
                      <line x1="0%" y1="55%" x2="100%" y2="55%" stroke="#ee3135" strokeWidth="1" strokeDasharray="6,6" />
                      <line x1="0%" y1="70%" x2="100%" y2="70%" stroke="#ee3135" strokeWidth="1.5" />
                      <line x1="0%" y1="85%" x2="100%" y2="85%" stroke="#ee3135" strokeWidth="2" />
                      <line x1="50%" y1="50%" x2="0%" y2="100%" stroke="#ee3135" strokeWidth="1.5" />
                      <line x1="50%" y1="50%" x2="25%" y2="100%" stroke="#ee3135" strokeWidth="1" />
                      <line x1="50%" y1="50%" x2="75%" y2="100%" stroke="#ee3135" strokeWidth="1" />
                      <line x1="50%" y1="50%" x2="100%" y2="100%" stroke="#ee3135" strokeWidth="1.5" />
                    </svg>
                  </div>
                )}

                {outlined && (
                  <div
                    style={{
                      left: `${outlined.box.x}%`,
                      top: `${outlined.box.y}%`,
                      width: `${outlined.box.w}%`,
                      height: `${outlined.box.h}%`,
                    }}
                    className="absolute z-10 border-2 border-dashed border-white rounded-md shadow-[0_0_0_2px_#ee3135] pointer-events-none"
                  >
                    <span className="absolute -top-0.5 left-0 -translate-y-full bg-[#ee3135] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-t-md whitespace-nowrap max-w-full truncate">
                      {outlined.label}
                    </span>
                  </div>
                )}

                {/* Insertion Target Pin in Benoit Red */}
                <div
                  style={{ left: `${markerPos.x}%`, top: `${markerPos.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-150 z-20 flex flex-col items-center"
                >
                  <div className="relative flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-[#ee3135]/40 animate-ping absolute" />
                    <div className="w-9 h-9 rounded-full bg-[#ee3135] border-2 border-white shadow-xl flex items-center justify-center text-white">
                      <MapPin className="w-5 h-5 fill-white text-[#ee3135]" />
                    </div>
                  </div>
                  <div className="mt-1 bg-slate-900 text-white border border-white/30 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                    Ponto Benoit
                  </div>
                </div>

                {/* Instruction Banner at bottom */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 max-w-[calc(100%-1rem)] bg-white/90 backdrop-blur-md border border-slate-200 rounded-full px-3 py-1 text-[11px] text-slate-800 flex items-center gap-1.5 pointer-events-none z-10 shadow-sm">
                  <Info className="w-3.5 h-3.5 text-[#ee3135] shrink-0" />
                  <span className="font-medium truncate">Toque na foto onde o produto deve ficar</span>
                </div>
              </>
            ) : (
              <div className="space-y-4 max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-[#ee3135] shadow-sm">
                  <Camera className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Nenhuma foto do cômodo selecionada
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Tire uma foto com a câmera, envie um arquivo ou escolha um dos ambientes de exemplo ao lado.
                  </p>
                </div>
                <div className="lg:hidden text-left bg-white border border-slate-200 rounded-xl p-3">
                  <PhotoGuide compact />
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-[#ee3135] hover:bg-[#b12124] text-white text-xs font-bold transition cursor-pointer shadow-sm"
                  >
                    Usar Câmera
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition cursor-pointer"
                  >
                    Fazer Upload
                  </button>
                </div>
              </div>
            )}
          </div>

          {roomImage && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3 min-h-[1.5rem]">
                <div className="min-w-0">
                  <PinStatusChip
                    detecting={detecting}
                    freeSpace={freeSpace}
                    failed={failed}
                    canIdentify={canIdentify}
                    onRetry={onRetryDetection}
                  />
                </div>
                {onDisableDetection && (detectedObjects !== undefined || detecting || failed) && (
                  <DisableDetectionLink
                    onClick={() => {
                      setChoice(null);
                      onPinIntentChange?.({ mode: "new" });
                      onDisableDetection();
                    }}
                  />
                )}
              </div>
              {underPin.length > 0 && !detecting && !failed && (
                <PinIntentCard
                  key={choiceKey}
                  objects={underPin}
                  pickIndex={pick}
                  onPickIndex={setPick}
                  choice={activeChoice}
                  onReplace={(target) => {
                    setChoice({ key: choiceKey, mode: "replace", target });
                    onPinIntentChange?.({ mode: "replace", target });
                    onNext();
                  }}
                  onNew={() => {
                    setChoice({ key: choiceKey, mode: "new" });
                    onPinIntentChange?.({ mode: "new" });
                  }}
                  onChangeChoice={() => {
                    setChoice(null);
                    onPinIntentChange?.({ mode: "new" });
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Right: Quick Samples & Guidelines (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-2">
              <Sparkles className="w-4 h-4 text-[#ee3135]" />
              <span>Ambientes de Exemplo</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Ou experimente agora mesmo com cômodos reais calibrados:
            </p>

            <div className="space-y-2.5">
              {SAMPLE_ROOMS.map((sample) => {
                const isSelected = roomImage === sample.imageUrl;
                return (
                  <div
                    key={sample.id}
                    onClick={() => onSelectImage(sample.imageUrl, sample)}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-red-50/50 border-[#ee3135] ring-2 ring-[#ee3135]/20 shadow-sm"
                        : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <div className="relative w-16 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                      <Image
                        src={sample.imageUrl}
                        alt={sample.name}
                        fill
                        className="object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800 truncate">
                          {sample.name}
                        </h4>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#ee3135] shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {sample.roomType}
                      </p>
                      <div className="text-[10px] text-slate-700 font-semibold mt-0.5">
                        Espaço aprox: {sample.estimatedSpaceCm.widthCm}cm × {sample.estimatedSpaceCm.depthCm}cm
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Guia de foto */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-3">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#ee3135]" />
              Como tirar a foto ideal
            </h4>
            <PhotoGuide />
          </div>

          {onLoadSavedRoom && <SavedRoomsPanel onOpen={onLoadSavedRoom} />}

          {/* Next Button */}
          {roomImage && (
            <button
              onClick={onNext}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#ee3135] hover:bg-[#b12124] text-white font-bold text-sm shadow-sm transition-colors cursor-pointer"
            >
              <span>Avançar: escolher produto</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
