"use client";

import React, { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { StepRoomCapture } from "@/components/StepRoomCapture";
import { StepProductSelector } from "@/components/StepProductSelector";
import { StepMeasurementChecker } from "@/components/StepMeasurementChecker";
import { StepVirtualSimulation } from "@/components/StepVirtualSimulation";
import { BenoitInAppBrowserModal } from "@/components/BenoitInAppBrowserModal";
import { SaveRoomDialog } from "@/components/capture/SaveRoomDialog";
import type { AiAnalysis } from "@/components/scene/AiAnalysisPanel";
import type { GeneratedPhoto } from "@/components/scene/useRealisticPhoto";
import { SAMPLE_ROOMS, BenoitProduct, RoomSample } from "@/data/benoit-catalog";
import { saveRoom } from "@/lib/saved-rooms";
import { kindLabel, kindsMatch, productKind } from "@/lib/kinds";
import { sameDetectedObject } from "@/lib/boxes";
import type {
  DetectedObject,
  PercentPoint,
  PinIntent,
  PhotoCalibration,
  RoomErasure,
  RoomMeasurements,
  SavedRoom,
  SceneItem,
  StyleProfile,
} from "@/lib/scene-types";

/** Análise da IA com os campos extras devolvidos por /api/room/analyze. */
type RoomAnalysis = AiAnalysis & {
  photoQuality?: { ok: boolean; issues: string[] };
  styleProfile?: StyleProfile;
  estimatedAvailableCm?: Partial<RoomMeasurements>;
  /** Móveis já existentes na foto (vêm junto da análise, sem chamada extra) */
  detectedObjects?: DetectedObject[];
};

const MAX_RECENT_PRODUCTS = 8;

const newUid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function createSceneItem(product: BenoitProduct, at: PercentPoint, existing: SceneItem[]): SceneItem {
  // Itens adicionados depois do primeiro ficam levemente deslocados para não se sobreporem
  const offset = existing.length === 0 ? 0 : ((existing.length % 4) - 1.5) * 12;
  return {
    uid: newUid(),
    product,
    x: Math.max(8, Math.min(92, at.x + offset)),
    y: at.y,
    scale: 1,
    flipped: false,
    z: existing.reduce((max, i) => Math.max(max, i.z), 0) + 1,
  };
}

export default function Home() {
  // Etapas: 1 = foto do cômodo, 2 = produto, 3 = medidas e simulação
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [step3SubView, setStep3SubView] = useState<"measure" | "simulate">("measure");

  // Cômodo (começa com uma sala de exemplo para a experiência ser imediata)
  const [roomImage, setRoomImage] = useState<string | null>(SAMPLE_ROOMS[0].imageUrl);
  const [markerPos, setMarkerPos] = useState<PercentPoint>(SAMPLE_ROOMS[0].defaultPosition);
  const [roomMeasurements, setRoomMeasurements] = useState<RoomMeasurements>(SAMPLE_ROOMS[0].estimatedSpaceCm);
  /** true depois que o cliente confirma/mede: a estimativa da IA não sobrescreve mais */
  const [measurementsConfirmed, setMeasurementsConfirmed] = useState(false);
  const [calibration, setCalibration] = useState<PhotoCalibration | undefined>();

  // Produto em foco (medidas/IA) e a cena com todos os produtos posicionados
  const [selectedProduct, setSelectedProduct] = useState<BenoitProduct | null>(null);
  const [sceneItems, setSceneItems] = useState<SceneItem[]>([]);
  const [recentProducts, setRecentProducts] = useState<BenoitProduct[]>([]);
  /** O cliente clicou em "+ Adicionar produto" na cena */
  const [isAddingToScene, setIsAddingToScene] = useState(false);
  /** Móvel da foto que o cliente escolheu substituir (fluxo "Substituir um móvel") */
  const [replaceTarget, setReplaceTarget] = useState<DetectedObject | null>(null);
  /** O que o cliente quer fazer no ponto marcado: trocar o móvel sob o pin ou colocar algo novo */
  const [pinIntent, setPinIntent] = useState<PinIntent | null>(null);
  /**
   * O cliente pediu para detectar os móveis da foto (botão "Detectar móveis da foto").
   * Desligado: o pin funciona no modo simples, sem perguntar nada. A análise da foto continua
   * rodando em segundo plano, então ao ligar o resultado costuma aparecer na hora.
   */
  const [detectionEnabled, setDetectionEnabled] = useState(false);
  /** Última foto realista gerada por IA (fica guardada ao navegar entre as etapas) */
  const [aiPhoto, setAiPhoto] = useState<GeneratedPhoto | null>(null);
  /** Móveis da foto removidos pelo cliente ("Remover da foto") e a prévia já apagada */
  const [erasure, setErasure] = useState<RoomErasure | null>(null);

  // Ambientes salvos
  const [savedRoomId, setSavedRoomId] = useState<string | undefined>();
  const [savedRoomName, setSavedRoomName] = useState<string>("");
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string>("");

  // Análise da IA (só existe depois de uma análise real ou da resposta padrão sinalizada)
  const [aiAnalysis, setAiAnalysis] = useState<RoomAnalysis | null>(null);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState<boolean>(false);
  const [aiFallbackReason, setAiFallbackReason] = useState<string>("");
  /** A IA não conseguiu analisar a foto (cota, rede): o pin não sabe o que há na foto */
  const [analysisFailed, setAnalysisFailed] = useState(false);
  /** Aviso curto exibido no topo (ex.: troca por produto de outro tipo) */
  const [notice, setNotice] = useState<string>("");
  const [isInAppBrowserOpen, setIsInAppBrowserOpen] = useState<boolean>(false);

  // Mudanças em sequência (vários cliques no marcador, troca rápida de produto) viram uma única
  // chamada à IA, feita 1,2 s depois da última mudança, para não gastar a cota da API
  const analysisTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measurementsConfirmedRef = useRef(measurementsConfirmed);
  useEffect(() => {
    measurementsConfirmedRef.current = measurementsConfirmed;
  }, [measurementsConfirmed]);
  useEffect(
    () => () => {
      if (analysisTimer.current) clearTimeout(analysisTimer.current);
    },
    []
  );

  // Só a resposta da análise mais recente, e da foto atual, pode alterar o estado
  const analysisSeq = useRef(0);
  const analysisAbort = useRef<AbortController | null>(null);
  const roomImageRef = useRef(roomImage);
  useEffect(() => {
    roomImageRef.current = roomImage;
  }, [roomImage]);

  const cancelAnalysis = () => {
    analysisSeq.current++;
    if (analysisTimer.current) clearTimeout(analysisTimer.current);
    analysisAbort.current?.abort();
    analysisAbort.current = null;
    setIsAnalyzingAI(false);
  };

  const analyzeNow = async (
    img: string,
    prod: BenoitProduct | null,
    marker: PercentPoint,
    measurements: RoomMeasurements
  ) => {
    const seq = ++analysisSeq.current;
    analysisAbort.current?.abort();
    const controller = new AbortController();
    analysisAbort.current = controller;
    const isCurrent = () => seq === analysisSeq.current && img === roomImageRef.current;
    try {
      const res = await fetch("/api/room/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          roomImage: img,
          productImage: prod?.imageUrl,
          product: prod,
          marker,
          userMeasurements: measurements,
        }),
      });
      const data = await res.json();
      if (!isCurrent()) return;
      setAnalysisFailed(Boolean(data?.fallback));
      setAiFallbackReason(data?.fallback ? data.fallbackReason || "serviço de IA indisponível" : "");
      if (data?.analysis) {
        const analysis = data.analysis as RoomAnalysis;
        setAiAnalysis(analysis);
        const est = analysis.estimatedAvailableCm;
        if (est && !measurementsConfirmedRef.current) {
          setRoomMeasurements((prev) => ({
            widthCm: est.widthCm || prev.widthCm,
            heightCm: est.heightCm || prev.heightCm,
            depthCm: est.depthCm || prev.depthCm,
          }));
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        console.warn("Falha ao consultar a análise de IA:", err);
        if (isCurrent()) setAnalysisFailed(true);
      }
    } finally {
      if (seq === analysisSeq.current) setIsAnalyzingAI(false);
    }
  };

  const runAIAnalysis = (
    img: string | null,
    prod: BenoitProduct | null,
    marker: PercentPoint,
    measurements: RoomMeasurements = roomMeasurements
  ) => {
    if (!img) return;
    if (analysisTimer.current) clearTimeout(analysisTimer.current);
    setIsAnalyzingAI(true);
    analysisTimer.current = setTimeout(() => analyzeNow(img, prod, marker, measurements), 1200);
  };

  const rememberProduct = (product: BenoitProduct) =>
    setRecentProducts((prev) => [product, ...prev.filter((p) => p.id !== product.id)].slice(0, MAX_RECENT_PRODUCTS));

  // ---------------------------------------------------------------- Cômodo

  const handleSelectRoomImage = (imageUrl: string, sampleData?: RoomSample) => {
    const newPos = sampleData?.defaultPosition || { x: 50, y: 70 };
    const measurements = sampleData?.estimatedSpaceCm ?? roomMeasurements;
    cancelAnalysis();
    setAiPhoto(null);
    setErasure(null);
    setPinIntent(null);
    setReplaceTarget(null);
    roomImageRef.current = imageUrl;
    setRoomImage(imageUrl);
    setMarkerPos(newPos);
    setRoomMeasurements(measurements);
    setMeasurementsConfirmed(false);
    // A calibração vale só para a foto em que foi feita
    setCalibration(undefined);
    setSavedRoomId(undefined);
    setSavedRoomName("");
    setAiAnalysis(null);
    // Mantém os produtos escolhidos, reposicionados no novo ponto
    setSceneItems((prev) =>
      prev.reduce<SceneItem[]>((acc, item) => [...acc, { ...createSceneItem(item.product, newPos, acc), uid: item.uid }], [])
    );
    runAIAnalysis(imageUrl, selectedProduct, newPos, measurements);
  };

  // Mover o marcador não chama a IA (economiza cota); se já há produtos na cena, eles acompanham o marcador
  // A sala de exemplo já vem aberta: analisa uma vez ao carregar para o pin saber o que há na foto
  // (a resposta fica em cache no servidor, então recarregar a página não gasta cota de novo)
  const initialAnalysisDone = useRef(false);
  useEffect(() => {
    if (initialAnalysisDone.current) return;
    const t = setTimeout(() => {
      // Marcado aqui (e não antes) para funcionar com o StrictMode do React, que monta/desmonta duas vezes em dev
      initialAnalysisDone.current = true;
      runAIAnalysis(roomImageRef.current, null, SAMPLE_ROOMS[0].defaultPosition);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só no primeiro carregamento
  }, []);

  const handleSetMarkerPos = (pos: PercentPoint) => {
    const dx = pos.x - markerPos.x;
    const dy = pos.y - markerPos.y;
    setMarkerPos(pos);
    setSceneItems((prev) =>
      prev.map((i) =>
        // Produtos que substituem um móvel ficam presos ao lugar desse móvel
        i.replaces
          ? i
          : {
              ...i,
              x: Math.max(2, Math.min(98, i.x + dx)),
              y: Math.max(2, Math.min(98, i.y + dy)),
            }
      )
    );
  };

  // Abrir um ambiente salvo não chama a IA automaticamente: as medidas e a cena já vêm salvas
  const handleLoadSavedRoom = (room: SavedRoom) => {
    const items = room.sceneItems ?? [];
    cancelAnalysis();
    setAiPhoto(null);
    setPinIntent(null);
    setReplaceTarget(null);
    roomImageRef.current = room.roomImage;
    setRoomImage(room.roomImage);
    setErasure(
      room.erasedImage && room.erasedObjects?.length
        ? { forImage: room.roomImage, objects: room.erasedObjects, image: room.erasedImage }
        : null
    );
    setMarkerPos(room.markerPos);
    setRoomMeasurements(room.measurements);
    setMeasurementsConfirmed(true);
    setCalibration(room.calibration);
    setSceneItems(items);
    setSelectedProduct(items[0]?.product ?? null);
    items.forEach((i) => rememberProduct(i.product));
    setSavedRoomId(room.id);
    setSavedRoomName(room.name);
    setAiAnalysis(null);
    setAiFallbackReason("");
    if (items.length > 0) {
      setCurrentStep(3);
      setStep3SubView("simulate");
    } else {
      setCurrentStep(2);
    }
  };

  // ---------------------------------------------------------------- Produtos e cena

  /** Escolha de produto (seletor ou navegador In-App). */
  const handleSelectProduct = (product: BenoitProduct) => {
    setSelectedProduct(product);
    rememberProduct(product);

    if (replaceTarget) {
      // Veio de "Substituir um móvel": o produto ocupa o lugar do móvel detectado
      const target = replaceTarget;
      const box = target.box;
      if (!kindsMatch(target.kind, productKind(product))) {
        setNotice(
          `Atenção: você trocou ${kindLabel(target.kind)} da foto por “${product.name}”, que é de outro tipo. Se não era isso, remova o item na cena.`
        );
        setTimeout(() => setNotice(""), 8000);
      }
      setSceneItems((prev) => {
        const placed: SceneItem = {
          ...createSceneItem(product, { x: box.x + box.w / 2, y: Math.min(98, box.y + box.h) }, []),
          z: prev.reduce((max, i) => Math.max(max, i.z), 0) + 1,
          // Tamanho real (calibração/estimativa). "Ajustar ao móvel antigo" fica como ação manual no editor.
          scale: 1,
          replaces: target,
        };
        // Se esse móvel já estava sendo substituído, troca o produto em vez de duplicar
        // (compara pela posição na foto: os ids podem mudar entre análises)
        const existing = prev.findIndex((i) => i.replaces && sameDetectedObject(i.replaces, target));
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { ...placed, uid: prev[existing].uid, z: prev[existing].z };
          return next;
        }
        return [...prev, placed];
      });
      // Sem medida feita pelo cliente: usa o tamanho estimado do móvel antigo como escala da cena
      // (assim todos os produtos aparecem em tamanho coerente) e como espaço disponível para o "Cabe?"
      const est = target.estimatedSizeCm;
      if (!calibration && est?.widthCm && box.w > 0) {
        setCalibration({
          cmPerPercentX: est.widthCm / box.w,
          referenceLabel: `${target.label} (~${Math.round(est.widthCm)} cm, estimado pela IA)`,
          referenceCm: est.widthCm,
          line: { a: { x: box.x, y: box.y + box.h }, b: { x: box.x + box.w, y: box.y + box.h } },
          source: "ai-estimate",
        });
      }
      if (est && !measurementsConfirmedRef.current) {
        setRoomMeasurements((prev) => ({
          widthCm: Math.max(prev.widthCm, est.widthCm),
          heightCm: Math.max(prev.heightCm, est.heightCm),
          depthCm: Math.max(prev.depthCm, est.depthCm),
        }));
      }
      setReplaceTarget(null);
      setPinIntent(null);
      setIsAddingToScene(false);
      setCurrentStep(3);
      setStep3SubView("simulate");
    } else if (isAddingToScene) {
      // Veio de "+ Adicionar produto": entra na cena e volta para a simulação.
      // Não chama a IA de novo: a análise de luz/estilo do cômodo continua valendo.
      setSceneItems((prev) => [...prev, createSceneItem(product, markerPos, prev)]);
      setIsAddingToScene(false);
      setCurrentStep(3);
      setStep3SubView("simulate");
    } else {
      // Escolha do produto principal: substitui o primeiro item (ou cria a cena)
      setSceneItems((prev) =>
        prev.length === 0 ? [createSceneItem(product, markerPos, [])] : [{ ...prev[0], product }, ...prev.slice(1)]
      );
      runAIAnalysis(roomImage, product, markerPos);
    }
  };

  const handleSceneItemsChange = (items: SceneItem[]) => {
    setSceneItems(items);
    // O produto em foco acompanha a cena (ex.: item removido ou cor trocada).
    // Com a cena vazia, mantém o último produto para a etapa 3 continuar visível.
    if (items.length > 0 && selectedProduct && !items.some((i) => i.product.id === selectedProduct.id)) {
      setSelectedProduct(items[0].product);
    }
  };

  const handleAddProduct = () => {
    setReplaceTarget(null);
    setIsAddingToScene(true);
    setCurrentStep(2);
  };

  const handleReplaceObject = (obj: DetectedObject) => {
    setIsAddingToScene(false);
    setReplaceTarget(obj);
    setCurrentStep(2);
  };

  /** Sai da escolha de produto aberta pela cena (adicionar/substituir) e volta para a simulação */
  const backToScene = () => {
    setIsAddingToScene(false);
    setReplaceTarget(null);
    setPinIntent(null);
    if (sceneItems.length === 0) {
      // A troca foi pedida pelo pin, antes de existir uma cena: volta para a foto
      setCurrentStep(1);
      return;
    }
    setCurrentStep(3);
    setStep3SubView("simulate");
  };

  const handlePinIntentChange = (intent: PinIntent | null) => {
    setPinIntent(intent);
    setReplaceTarget(intent?.mode === "replace" && intent.target ? intent.target : null);
  };

  // ---------------------------------------------------------------- Salvar ambiente

  const handleSaveRoom = async (name: string) => {
    if (!roomImage) return;
    try {
      const saved = await saveRoom({
        id: savedRoomId,
        name,
        roomImage,
        markerPos,
        measurements: roomMeasurements,
        calibration,
        sceneItems,
        ...(erasure && erasure.forImage === roomImage ? { erasedObjects: erasure.objects, erasedImage: erasure.image } : {}),
      });
      setSavedRoomId(saved.id);
      setSavedRoomName(saved.name);
      setSaveNotice(`Ambiente “${saved.name}” salvo em Meus ambientes.`);
    } catch {
      setSaveNotice("Não foi possível salvar o ambiente neste navegador.");
    } finally {
      setIsSaveDialogOpen(false);
      setTimeout(() => setSaveNotice(""), 4000);
    }
  };

  const handleReset = () => {
    cancelAnalysis();
    setAiPhoto(null);
    setErasure(null);
    roomImageRef.current = SAMPLE_ROOMS[0].imageUrl;
    setRoomImage(SAMPLE_ROOMS[0].imageUrl);
    setMarkerPos(SAMPLE_ROOMS[0].defaultPosition);
    setRoomMeasurements(SAMPLE_ROOMS[0].estimatedSpaceCm);
    setMeasurementsConfirmed(false);
    setCalibration(undefined);
    setSelectedProduct(null);
    setSceneItems([]);
    setIsAddingToScene(false);
    setReplaceTarget(null);
    setPinIntent(null);
    setSavedRoomId(undefined);
    setSavedRoomName("");
    setAiAnalysis(null);
    setAiFallbackReason("");
    setAnalysisFailed(false);
    setCurrentStep(1);
    // Recomeçar volta à sala de exemplo: analisa de novo (a resposta está em cache no servidor)
    runAIAnalysis(SAMPLE_ROOMS[0].imageUrl, null, SAMPLE_ROOMS[0].defaultPosition, SAMPLE_ROOMS[0].estimatedSpaceCm);
    setStep3SubView("measure");
  };

  const goToStep3 = () => {
    if (sceneItems.length === 0 && selectedProduct) {
      setSceneItems([createSceneItem(selectedProduct, markerPos, [])]);
    }
    setCurrentStep(3);
    setStep3SubView("measure");
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans selection:bg-[#ee3135] selection:text-white">
      <Header
        currentStep={currentStep}
        onSelectStep={(step) => {
          // Navegar pelo cabeçalho encerra o modo "adicionar/substituir" aberto pela cena
          setIsAddingToScene(false);
          setReplaceTarget(null);
          if (step === 3) goToStep3();
          else setCurrentStep(step);
        }}
        onReset={handleReset}
        hasRoom={Boolean(roomImage)}
        hasProduct={Boolean(selectedProduct)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {notice && (
          <div
            role="status"
            className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold"
          >
            {notice}
          </div>
        )}
        {saveNotice && (
          <div
            role="status"
            className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold"
          >
            {saveNotice}
          </div>
        )}

        {/* Etapa 1: foto do cômodo */}
        {currentStep === 1 && (
          <StepRoomCapture
            roomImage={roomImage}
            markerPos={markerPos}
            onSelectImage={handleSelectRoomImage}
            onSetMarkerPos={handleSetMarkerPos}
            onNext={() => setCurrentStep(2)}
            aiPhotoIssues={aiAnalysis?.photoQuality?.ok === false ? aiAnalysis.photoQuality.issues : undefined}
            onLoadSavedRoom={handleLoadSavedRoom}
            detectedObjects={detectionEnabled && aiAnalysis ? aiAnalysis.detectedObjects ?? [] : undefined}
            isDetecting={detectionEnabled && isAnalyzingAI}
            detectionFailed={detectionEnabled && analysisFailed}
            onRetryDetection={() => {
              setDetectionEnabled(true);
              // Só chama a IA se a análise em segundo plano ainda não trouxe os móveis (ou falhou)
              if (!isAnalyzingAI && (analysisFailed || !aiAnalysis?.detectedObjects)) {
                runAIAnalysis(roomImage, selectedProduct, markerPos);
              }
            }}
            onDisableDetection={() => {
              setDetectionEnabled(false);
              setPinIntent(null);
              setReplaceTarget(null);
            }}
            pinIntent={pinIntent}
            onPinIntentChange={handlePinIntentChange}
          />
        )}

        {/* Etapa 2: produto */}
        {currentStep === 2 && (
          <>
            {(isAddingToScene || replaceTarget) && (
              <div className="mb-4 p-3 rounded-xl bg-[#ee3135]/5 border border-[#ee3135]/20 text-xs text-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span>
                  {replaceTarget ? (
                    <>
                      <strong>Substituindo: {replaceTarget.label}.</strong> Escolha o produto da Benoit que vai ocupar o
                      lugar dele.
                    </>
                  ) : (
                    <>
                      <strong>Adicionando à cena:</strong> escolha um produto para colocar junto com os{" "}
                      {sceneItems.length} que já estão no seu ambiente.
                    </>
                  )}
                </span>
                <button
                  onClick={backToScene}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 font-semibold cursor-pointer hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            )}
            <StepProductSelector
              selectedProduct={selectedProduct}
              onSelectProduct={handleSelectProduct}
              onBack={() => {
                if (isAddingToScene || replaceTarget) backToScene();
                else setCurrentStep(1);
              }}
              onNext={goToStep3}
              onOpenInAppBrowser={() => setIsInAppBrowserOpen(true)}
              roomMeasurements={roomMeasurements}
              styleProfile={aiAnalysis?.styleProfile}
              initialQuery={replaceTarget?.searchQuery}
              initialCategoryPath={replaceTarget?.categoryPath}
            />
          </>
        )}

        {/* Etapa 3: medidas e simulação */}
        {currentStep === 3 && roomImage && (
          <>
            {aiFallbackReason && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <strong>Análise de IA indisponível.</strong> Os dados de luz e sombra são valores padrão, não uma
                análise da sua foto; o encaixe foi calculado pelas medidas.{" "}
                <span className="text-amber-700">({aiFallbackReason})</span>
              </div>
            )}
            {step3SubView === "measure" && selectedProduct ? (
              <StepMeasurementChecker
                key={selectedProduct.id}
                product={selectedProduct}
                roomImage={roomImage}
                markerPos={markerPos}
                initialRoomWidthCm={roomMeasurements.widthCm}
                initialRoomHeightCm={roomMeasurements.heightCm}
                initialRoomDepthCm={roomMeasurements.depthCm}
                calibration={calibration}
                onCalibrationChange={setCalibration}
                onMeasurementsChange={(m) => {
                  // Medida digitada/medida pela foto: vale mais que a estimativa da IA
                  setMeasurementsConfirmed(true);
                  setRoomMeasurements(m);
                }}
                onConfirmMeasurements={(m) => {
                  setRoomMeasurements(m);
                  setMeasurementsConfirmed(true);
                  setStep3SubView("simulate");
                }}
                onBack={() => setCurrentStep(2)}
                isAnalyzingAI={isAnalyzingAI}
              />
            ) : (
              <StepVirtualSimulation
                roomImage={roomImage}
                items={sceneItems}
                onItemsChange={handleSceneItemsChange}
                measurements={roomMeasurements}
                calibration={calibration}
                aiAnalysis={aiAnalysis}
                recentProducts={recentProducts}
                onAddProduct={handleAddProduct}
                onBackToMeasurements={() => setStep3SubView("measure")}
                onResetAll={handleReset}
                onSaveRoom={() => setIsSaveDialogOpen(true)}
                onReplaceObject={handleReplaceObject}
                detectedObjects={aiAnalysis?.detectedObjects}
                aiPhoto={aiPhoto}
                onAiPhotoChange={setAiPhoto}
                erasure={erasure}
                onErasureChange={setErasure}
              />
            )}
          </>
        )}
      </main>

      <BenoitInAppBrowserModal
        isOpen={isInAppBrowserOpen}
        onClose={() => setIsInAppBrowserOpen(false)}
        roomMeasurements={roomMeasurements}
        onSelectProduct={(prod) => {
          const fromScene = isAddingToScene || Boolean(replaceTarget);
          handleSelectProduct(prod);
          if (!fromScene) {
            setCurrentStep(3);
            setStep3SubView("measure");
          }
        }}
      />

      <SaveRoomDialog
        isOpen={isSaveDialogOpen}
        onClose={() => setIsSaveDialogOpen(false)}
        onSave={handleSaveRoom}
        defaultName={savedRoomName || undefined}
      />

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#053087]">Lojas Benoit</span>
            <span className="text-slate-300">•</span>
            <span>Simulador Benoit Casa Viva com IA</span>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span>Seu ambiente real • Catálogo oficial • Medidas, entrega e frete</span>
            <span className="text-slate-300">•</span>
            <a href="/loja" className="font-semibold text-[#ee3135] hover:underline">
              Área do vendedor
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
