/**
 * Detecção de móveis na foto: schema do Gemini, trecho de prompt e conversão da resposta.
 * Compartilhado por /api/room/detect e /api/room/analyze.
 */
import { Type } from "@google/genai";
import type { DetectedObject, PercentBox } from "@/lib/scene-types";

export const DETECT_PATHS = [
  "/moveis-e-decoracao/sala-de-estar/sofa",
  "/moveis-e-decoracao/sala-de-estar/poltrona",
  "/moveis-e-decoracao/sala-de-estar/puff",
  "/moveis-e-decoracao/sala-de-estar/racks-e-paineis",
  "/moveis-e-decoracao/sala-de-estar/estante",
  "/moveis-e-decoracao/sala-de-estar/mesa-de-centro",
  "/moveis-e-decoracao/sala-de-estar/aparador",
  "/moveis-e-decoracao/sala-de-estar/buffet",
  "/moveis-e-decoracao/sala-de-estar/cristaleira",
  "/moveis-e-decoracao/quarto/guarda-roupa",
  "/moveis-e-decoracao/quarto/cama",
  "/moveis-e-decoracao/quarto/mesa-de-cabeceira",
  "/moveis-e-decoracao/quarto/comoda",
  "/moveis-e-decoracao/cozinha/mesas-e-cadeiras",
  "/moveis-e-decoracao/cozinha/banquetas",
  "/moveis-e-decoracao/escritorio/escrivaninha",
  "/moveis-e-decoracao/escritorio/cadeira",
  "/eletro/eletrodomesticos/refrigerador",
  "/eletro/eletrodomesticos/fogao",
  "/eletro/eletrodomesticos/lavadora",
  "/tecnologia/som-e-imagem/tv",
];
const VALID_PATHS = new Set(DETECT_PATHS);

/** Instruções (sem a introdução) para listar os móveis existentes na foto. */
export const DETECT_INSTRUCTIONS = `Liste até 12 móveis e eletrodomésticos JÁ PRESENTES na foto que a Benoit poderia vender como substitutos: sofá, poltrona, mesa (jantar, centro, lateral), cadeira, rack/painel, TV, geladeira, fogão, lavadora, cama, guarda-roupa, cômoda etc.
Ignore decoração pequena (quadros, vasos, almofadas), paredes, janelas, cortinas e tapetes.
Para cada item informe:
- label: nome curto em português (ex.: "Mesa de jantar", "Sofá de 3 lugares").
- kind: um entre sofa, poltrona, mesa, cadeira, rack, tv, geladeira, fogao, lavadora, cama, guarda-roupa, comoda, aparador, estante, puff, outro.
- box_2d: caixa justa ao redor do item inteiro no formato [ymin, xmin, ymax, xmax], inteiros normalizados de 0 a 1000.
- estimated_size_cm: tamanho REAL estimado do móvel em cm { width, height, depth }, com base em tamanhos típicos e na perspectiva (ex.: sofá de 3 lugares ~200–220 cm de largura, mesa de jantar de 6 lugares ~160 cm).
- searchQuery: termo CURTO e GENÉRICO (1 a 3 palavras, sem adjetivos, cor, material ou medidas), como "cadeira", "aparador", "mesa de centro", "sofá". Termos específicos zeram a busca.
- categoryPath: caminho VÁLIDO do site, escolhido desta lista: ${DETECT_PATHS.join(", ")}. Para cadeiras de jantar/cozinha NÃO informe categoryPath (a busca "cadeira" no site todo funciona melhor). Omita também se nenhum caminho servir.
Se não houver nenhum item relevante, devolva a lista vazia.`;

/** Schema de UM objeto detectado (para compor em outros schemas). */
export const detectedObjectSchema = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING },
    kind: { type: Type.STRING },
    box_2d: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "[ymin, xmin, ymax, xmax] de 0 a 1000" },
    estimated_size_cm: {
      type: Type.OBJECT,
      properties: { width: { type: Type.NUMBER }, height: { type: Type.NUMBER }, depth: { type: Type.NUMBER } },
      required: ["width", "height", "depth"],
    },
    searchQuery: { type: Type.STRING },
    categoryPath: { type: Type.STRING },
  },
  required: ["label", "kind", "box_2d", "estimated_size_cm", "searchQuery"],
};

export interface RawDetectedObject {
  label?: string;
  kind?: string;
  box_2d?: number[];
  estimated_size_cm?: { width?: number; height?: number; depth?: number };
  searchQuery?: string;
  categoryPath?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const validSize = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 10 && n <= 400;

/** Id estável: mesmo móvel na mesma posição gera o mesmo id em análises diferentes. */
function stableId(kind: string, box: PercentBox, existing: DetectedObject[]) {
  const q = (n: number) => Math.round(n / 5);
  const base = `${kind}-${q(box.x)}-${q(box.y)}-${q(box.w)}-${q(box.h)}`;
  let id = base;
  for (let i = 2; existing.some((e) => e.id === id); i++) id = `${base}-${i}`;
  return id;
}

// Geometria de caixas fica em lib/boxes.ts (sem dependências, usável no navegador)
export { boxIoU, sameDetectedObject } from "@/lib/boxes";

/** Converte a resposta do modelo em DetectedObject[] validados. */
export function toDetectedObjects(raw: unknown): DetectedObject[] {
  if (!Array.isArray(raw)) return [];
  const out: DetectedObject[] = [];
  for (const o of (raw as RawDetectedObject[]).slice(0, 12)) {
    const b = o?.box_2d;
    if (!Array.isArray(b) || b.length !== 4 || b.some((n) => typeof n !== "number" || !Number.isFinite(n))) continue;
    const [ymin, xmin, ymax, xmax] = b.map((n) => clamp(n, 0, 1000));
    if (ymax <= ymin || xmax <= xmin || !o.label) continue;
    const r = (n: number) => Math.round(n * 10) / 10;
    const kind = (o.kind || "outro").trim();
    const box = { x: r(xmin / 10), y: r(ymin / 10), w: r((xmax - xmin) / 10), h: r((ymax - ymin) / 10) };
    const s = o.estimated_size_cm;
    out.push({
      id: stableId(kind, box, out),
      label: o.label.trim(),
      kind,
      box,
      estimatedSizeCm:
        s && validSize(s.width) && validSize(s.height) && validSize(s.depth)
          ? { widthCm: Math.round(s.width), heightCm: Math.round(s.height), depthCm: Math.round(s.depth) }
          : undefined,
      searchQuery: (o.searchQuery || o.label).trim(),
      categoryPath:
        kind === "cadeira" && !/escritorio/.test(o.categoryPath ?? "")
          ? undefined
          : o.categoryPath && VALID_PATHS.has(o.categoryPath)
            ? o.categoryPath
            : undefined,
    });
  }
  return out;
}
