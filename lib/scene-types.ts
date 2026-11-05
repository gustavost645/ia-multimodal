/**
 * Contratos compartilhados entre as partes do simulador.
 * Mudanças aqui afetam vários componentes: combine antes com o orquestrador.
 */
import type { BenoitProduct } from "@/data/benoit-catalog";

/** Posição em % da imagem do cômodo (0–100). */
export interface PercentPoint {
  x: number;
  y: number;
}

/**
 * Calibração de escala obtida pela ferramenta "Medir pela foto".
 * cmPerPercentX: quantos centímetros correspondem a 1% da LARGURA da imagem,
 * medidos na profundidade da referência (ex.: uma porta de 80 cm que ocupa 20% → 4 cm/%).
 */
export interface PhotoCalibration {
  cmPerPercentX: number;
  referenceLabel: string; // ex.: "Porta (80 cm)"
  referenceCm: number;
  /** Linha marcada pelo usuário sobre a referência, em % da imagem */
  line: { a: PercentPoint; b: PercentPoint };
  /**
   * Origem: "user" = medida pelo cliente (escala real); "ai-estimate" = tamanho típico estimado pela IA
   * para o móvel substituído (escala aproximada). Ausente = "user" (compatível com ambientes salvos).
   */
  source?: "user" | "ai-estimate";
}

/** Um produto posicionado na cena. */
export interface SceneItem {
  uid: string;
  product: BenoitProduct;
  /** Centro da BASE do produto (onde ele toca o chão), em % da imagem */
  x: number;
  y: number;
  /** Multiplicador sobre o tamanho real (1 = tamanho calculado pelas medidas e calibração) */
  scale: number;
  flipped: boolean;
  /**
   * Giro em graus em torno do eixo vertical (-60 a 60). Positivo = o lado direito do produto vai para o fundo,
   * ou seja, a frente passa a apontar para a direita da foto. Ausente = 0 (de frente).
   */
  rotation?: number;
  /** Ordem de empilhamento (maior = na frente) */
  z: number;
  /** Móvel da foto que este produto substitui (a foto realista com IA o remove) */
  replaces?: DetectedObject;
}

/** Retângulo em % da imagem (canto superior esquerdo + largura/altura). */
export interface PercentBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Móvel/eletro já existente na foto do cliente, detectado pela IA (POST /api/room/detect). */
export interface DetectedObject {
  id: string;
  /** Nome amigável em português, ex.: "Mesa de jantar", "Sofá de 3 lugares" */
  label: string;
  /** Tipo simples: sofa | poltrona | mesa | cadeira | rack | tv | geladeira | fogao | lavadora | cama | guarda-roupa | comoda | outro */
  kind: string;
  box: PercentBox;
  /** Busca sugerida no catálogo da Benoit para substituí-lo */
  searchQuery: string;
  categoryPath?: string;
  /** Tamanho real estimado pela IA (ex.: sofá de 3 lugares ≈ 210 × 90 × 95 cm) */
  estimatedSizeCm?: RoomMeasurements;
}

/**
 * Móveis da foto que o cliente pediu para remover ("Remover da foto").
 * A prévia (image) é gerada no navegador (contorno automático + preenchimento por IA local);
 * a foto realista com IA recebe a foto original e a lista de móveis para removê-los com qualidade.
 */
export interface RoomErasure {
  /** Foto original a que a remoção se refere (deixa de valer se a foto mudar) */
  forImage: string;
  objects: DetectedObject[];
  /** Foto com os móveis apagados (JPEG data URL) */
  image: string;
}

/**
 * O que o cliente quer fazer no ponto marcado (pin) na foto.
 * - "replace": trocar o móvel que está sob o pin (target)
 * - "new": colocar um produto novo no ponto, sem remover nada
 */
export interface PinIntent {
  mode: "replace" | "new";
  target?: DetectedObject;
}

export interface DetectResponse {
  success: boolean;
  objects: DetectedObject[];
  /** Presente quando a IA não pôde responder (cota, erro); objects vem vazio */
  fallbackReason?: string;
  /** Provedor que respondeu (Gemini ou a reserva OpenAI) */
  provider?: AiProvider;
}

export type AiProvider = "gemini" | "aihubmix" | "openai" | "openrouter";

/** Corpo de POST /api/room/generate (foto realista com IA). */
export interface GenerateRequest {
  roomImage: string; // data URL ou URL permitida
  /** Render do editor (JPEG data URL) mostrando posição e tamanho exatos dos produtos */
  guideImage: string;
  items: {
    productName: string;
    productImageUrl: string;
    /** centro da base e tamanho, em % da imagem */
    x: number;
    y: number;
    widthPct: number;
    heightPct: number;
    flipped: boolean;
    /** giro em graus (ver SceneItem.rotation) */
    rotation?: number;
    replaces?: DetectedObject;
  }[];
  /** Móveis da foto que devem ser removidos sem colocar nada no lugar */
  removed?: DetectedObject[];
}

export interface GenerateResponse {
  success: boolean;
  /** JPEG/PNG data URL da foto gerada */
  image?: string;
  model?: string;
  provider?: AiProvider;
  /**
   * Quando a imagem saiu numa proporção diferente da foto (ex.: OpenAI só gera 3:2, 2:3, 1:1):
   * recorte, em % da imagem gerada, que devolve a proporção original. A interface deve aplicá-lo.
   */
  cropBox?: PercentBox;
  /** Motivo amigável em português quando não gerou */
  error?: string;
  reason?: "billing" | "quota" | "rate_limit" | "invalid" | "error";
}

export interface RoomMeasurements {
  widthCm: number;
  heightCm: number;
  depthCm: number;
}

/** Sugestão de busca gerada pela IA a partir da foto do cômodo. */
export interface StyleSuggestion {
  label: string; // ex.: "Sofás em tons neutros"
  query: string; // texto para a busca da Benoit
  categoryPath?: string; // ex.: "/moveis-e-decoracao/sala-de-estar/sofa"
}

export interface StyleProfile {
  style: string; // ex.: "Contemporâneo"
  dominantColors: string[]; // ex.: ["cinza claro", "madeira natural"]
  suggestions: StyleSuggestion[];
}

/** Ambiente salvo pelo usuário ("Meus ambientes"), guardado no IndexedDB do navegador. */
export interface SavedRoom {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  roomImage: string; // data URL ou URL
  markerPos: PercentPoint;
  measurements: RoomMeasurements;
  calibration?: PhotoCalibration;
  sceneItems?: SceneItem[];
  /** Móveis removidos da foto e a prévia já apagada (ver RoomErasure) */
  erasedObjects?: DetectedObject[];
  erasedImage?: string;
}
