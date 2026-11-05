/**
 * Especificações para o modelo gratuito de visão da AIHubMix (sem schema garantido):
 * instruções de formato JSON e normalização da saída para o mesmo formato do Gemini.
 */
import type { FreeSpec } from "@/lib/ai-provider";
import { DETECT_PATHS } from "@/lib/detection";

const OBJECT_FORMAT = `{"label":"Mesa de jantar","kind":"mesa","box":{"xmin":0,"ymin":0,"xmax":0,"ymax":0},"estimated_size_cm":{"width":0,"height":0,"depth":0},"searchQuery":"mesa","categoryPath":"/caminho/valido ou null"}`;

const BOX_RULES = `Regras do campo "box": use SEMPRE o objeto nomeado com xmin, ymin, xmax e ymax (NÃO use listas). Os valores são inteiros de 0 a 1000 relativos à imagem inteira: xmin e xmax são horizontais (0 = borda esquerda, 1000 = borda direita); ymin e ymax são verticais (0 = topo, 1000 = base). A caixa deve ser justa ao redor do móvel inteiro. Ignore a instrução de box_2d: use apenas "box". "kind" deve ser um de: sofa, poltrona, mesa, cadeira, rack, tv, geladeira, fogao, lavadora, cama, guarda-roupa, comoda, aparador, estante, puff, outro. "categoryPath" deve ser um destes caminhos ou null: ${DETECT_PATHS.join(", ")}.`;

export const FREE_DETECT_SPEC: FreeSpec = {
  instructions: `Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, exatamente neste formato (até 12 itens; lista vazia se não houver móveis):
{"objects":[${OBJECT_FORMAT}]}
${BOX_RULES}`,
  normalize: (parsed) => ({ objects: normalizeObjects((parsed as { objects?: unknown })?.objects) }),
};

export const FREE_ANALYSIS_SPEC: FreeSpec = {
  instructions: `Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, exatamente neste formato (a análise de luz e sombra pode ser omitida; foque em listar os móveis existentes):
{"roomType":"Sala de Estar","floorType":"...","designTips":"...","photoQuality":{"ok":true,"issues":[]},"styleProfile":{"style":"...","dominantColors":["..."],"suggestions":[{"label":"...","query":"...","categoryPath":"/caminho/valido ou null"}]},"estimatedAvailableCm":{"widthCm":0,"heightCm":0,"depthCm":0},"detectedObjects":[${OBJECT_FORMAT}]}
${BOX_RULES}`,
  normalize: (parsed) => {
    const p = (parsed ?? {}) as Record<string, unknown>;
    return {
      roomType: typeof p.roomType === "string" ? p.roomType : "Cômodo residencial",
      floorType: typeof p.floorType === "string" ? p.floorType : "Piso não identificado",
      backgroundAnalysis: {
        lightSourceLocation: "Iluminação natural lateral e luz de teto difusa",
        lightTemperature: "Luz neutra equilibrada",
        floorPlaneAngleDeg: 0,
        shadowDirection: "left",
        shadowAngleDeg: -25,
        shadowBlurPx: 14,
        shadowOpacity: 0.6,
        detectedObstacles: [],
      },
      fitStatus: "tight",
      fitSummary: "Análise simplificada: confira as medidas do produto e do espaço antes de comprar.",
      designTips: typeof p.designTips === "string" ? p.designTips : "",
      ergonomicWarnings: [],
      colorHarmonyScore: 70,
      recommendedScaleFactor: 1,
      photoQuality: p.photoQuality ?? { ok: true, issues: [] },
      styleProfile: p.styleProfile,
      estimatedAvailableCm: p.estimatedAvailableCm,
      detectedObjects: normalizeObjects(p.detectedObjects),
      simplifiedAnalysis: true,
    };
  },
};

/** Converte `box` {xmin,ymin,xmax,ymax} no box_2d [ymin,xmin,ymax,xmax] esperado por toDetectedObjects. */
function normalizeObjects(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const out: Record<string, unknown>[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    const b = o.box as { xmin?: unknown; ymin?: unknown; xmax?: unknown; ymax?: unknown } | undefined;
    const n = (v: unknown) => (typeof v === "number" ? v : Number(v));
    let box2d: number[] | undefined;
    if (b && typeof b === "object") {
      box2d = [n(b.ymin), n(b.xmin), n(b.ymax), n(b.xmax)];
    } else if (Array.isArray(o.box_2d)) {
      box2d = o.box_2d.map(n);
    }
    if (!box2d || box2d.some((v) => !Number.isFinite(v))) continue;
    const s = o.estimated_size_cm as Record<string, unknown> | undefined;
    out.push({
      label: o.label,
      kind: o.kind,
      box_2d: box2d,
      estimated_size_cm: s ? { width: n(s.width), height: n(s.height), depth: n(s.depth) } : undefined,
      searchQuery: o.searchQuery,
      categoryPath: typeof o.categoryPath === "string" ? o.categoryPath : undefined,
    });
  }
  return out;
}
