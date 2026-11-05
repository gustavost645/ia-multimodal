import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { evaluateFit } from "@/lib/fit";
import { DETECT_INSTRUCTIONS, detectedObjectSchema, toDetectedObjects } from "@/lib/detection";
import { FREE_ANALYSIS_SPEC } from "@/lib/detection-free";
import { ANALYZE_JSON_SCHEMA, generateJson } from "@/lib/ai-provider";
import {
  AllModelsUnavailableError,
  BodyTooLargeError,
  readJsonWithLimit,
  RateLimitError,
  createRateLimiter,
  getClientIp,
  loadImagePart,
} from "@/lib/gemini";

export const dynamic = 'force-dynamic';

// Cache das análises: a mesma foto + produto + posição não gasta outra chamada
const analysisCache = new Map<string, unknown>();
const CACHE_LIMIT = 100;

function cacheKey(body: Record<string, unknown>) {
  const marker = body.marker as { x?: number; y?: number } | undefined;
  const product = body.product as { id?: string } | undefined;
  const round = (v?: number) => Math.round((v ?? 0) / 5) * 5; // posições a menos de 5% contam como a mesma
  return createHash("sha1")
    .update(String(body.roomImage))
    .update(`|${product?.id}|${round(marker?.x)}|${round(marker?.y)}|${JSON.stringify(body.userMeasurements ?? null)}`)
    .digest("hex");
}

const MAX_BODY_BYTES = 12 * 1024 * 1024;

// Limite por IP: cada análise consome a cota do Gemini (respostas do cache não contam)
const RATE_LIMIT = 15;
const limiter = createRateLimiter(RATE_LIMIT, 60 * 60 * 1000);

// Falhas recentes da IA por foto: evita chamar Gemini + OpenAI de novo a cada visita (~5 min)
const AI_FAILURE_TTL_MS = 5 * 60_000;
const aiFailures = new Map<string, { until: number; reason: string }>();
class RecentAiFailureError extends Error {}

type FallbackInput = {
  product?: { dimensions?: { widthCm?: number; heightCm?: number; depthCm?: number; openDepthCm?: number } };
  userMeasurements?: { widthCm?: number; heightCm?: number; depthCm?: number };
};

export async function POST(req: NextRequest) {
  let fb: FallbackInput | null = null;
  try {
    let body: any;
    try {
      body = await readJsonWithLimit(req, MAX_BODY_BYTES);
    } catch (e) {
      if (e instanceof BodyTooLargeError) {
        return NextResponse.json({ error: "Imagem grande demais. Envie uma foto menor (até ~8 MB)." }, { status: 413 });
      }
      return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    fb = body;
    const {
      roomImage,
      productImage,
      product,
      marker,
      userMeasurements,
    } = body;

    const key = cacheKey(body);
    const cached = analysisCache.get(key);
    if (cached) {
      return NextResponse.json({ success: true, analysis: cached, cached: true });
    }

    if (!roomImage) {
      return NextResponse.json(
        { error: "Imagem do cômodo não fornecida" },
        { status: 400 }
      );
    }

    const imageHash = createHash("sha1").update(String(roomImage)).digest("hex");
    const recent = aiFailures.get(imageHash);
    if (recent && recent.until > Date.now()) throw new RecentAiFailureError(recent.reason);

    // Imagens da cena: aceita base64 (foto enviada pelo usuário) ou URL (salas de exemplo, fotos da Benoit)
    const [roomPart, productPart] = await Promise.all([loadImagePart(roomImage), loadImagePart(productImage)]);
    if (!roomPart) {
      // Sem a foto do cômodo a análise seria inventada: não gasta cota da IA
      throw new Error("não foi possível carregar a foto do cômodo");
    }

    const waitMin = limiter.consume(getClientIp(req));
    if (waitMin !== null) {
      throw new RateLimitError(
        `Você atingiu o limite de ${RATE_LIMIT} análises por hora. Tente novamente em ~${waitMin} min.`
      );
    }

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: "IMAGEM 1 — FOTO DO CÔMODO (fundo da cena):" },
      roomPart,
    ];
    if (productPart) {
      parts.push({ text: "IMAGEM 2 — FOTO DO PRODUTO BENOIT a ser inserido na cena:" }, productPart);
    }

    const targetWidth = userMeasurements?.widthCm || 220;
    const targetHeight = userMeasurements?.heightCm || 240;
    const targetDepth = userMeasurements?.depthCm || 120;

    const promptText = `
Você é o especialista de interiores, computação visual e IA espacial do simulador "Benoit Casa Viva" das Lojas Benoit.
Analise a fotografia do cômodo (fundo da cena) em conjunto com o objeto/produto Benoit a ser inserido.

Dados do Produto:
- Nome: "${product?.name || 'Móvel/Eletrodoméstico'}" (Categoria: ${product?.category || 'geral'})
- Dimensões do Produto: Largura ${product?.dimensions?.widthCm || 200}cm, Altura ${product?.dimensions?.heightCm || 100}cm, Profundidade ${product?.dimensions?.depthCm || 80}cm
${product?.dimensions?.openDepthCm ? `- Profundidade com portas abertas/reclinado: ${product.dimensions.openDepthCm}cm` : ''}

Local de Inserção demarcado: X: ${marker?.x ?? 50}%, Y: ${marker?.y ?? 70}% na imagem.
Medidas de espaço disponíveis: Largura ${targetWidth}cm, Altura ${targetHeight}cm, Profundidade ${targetDepth}cm.

Faça uma análise profunda do FUNDO DA IMAGEM (cômodo) EM CONJUNTO COM O OBJETO (móvel/eletrodoméstico):
1. ANÁLISE DO FUNDO:
   - Identifique o piso (porcelanato, cerâmica, madeira, laminado, vinílico) e a presença de rodapés ou tapetes.
   - Detecte de onde vem a fonte de luz dominante (janela à esquerda/direita, spot de teto, iluminação difusa).
   - Estime o vetor da sombra que o objeto deverá projetar no piso (direção e ângulo).
2. ANÁLISE DO OBJETO:
   - Textura e reflexividade do acabamento (tecido, inox, laca, madeira).
   - Como os pontos de contato (pés ou base) devem assentar no plano do chão.
3. COMPATIBILIDADE E VIABILIDADE:
   - "optimal" (cabe com folga > 15cm), "tight" (cabe justo, < 15cm ou atenção a portas/gavetas), ou "exceeds" (ultrapassa).
   - Harmonia cromática de 0 a 100 entre o tom do objeto e a paleta do fundo.
   - Recomendações ergonômicas e dicas práticas de decoração.

4. QUALIDADE DA FOTO (photoQuality):
   - ok = true somente se a foto serve para a simulação. Liste em issues (português, frases curtas) problemas como: foto escura, torta/inclinada, cortada, sem piso visível, tremida, com muito reflexo.
5. ESTILO E SUGESTÕES (styleProfile):
   - Informe o estilo de decoração do ambiente (ex.: Contemporâneo, Industrial, Rústico, Minimalista), as cores dominantes e de 3 a 6 sugestões de produtos das Lojas Benoit que combinam com o ambiente.
   - Cada sugestão tem label (ex.: "Sofás em tons neutros"), query (termo curto de busca no site) e categoryPath. Use SOMENTE caminhos válidos, como: /moveis-e-decoracao/sala-de-estar/sofa, /moveis-e-decoracao/sala-de-estar/racks-e-paineis, /moveis-e-decoracao/sala-de-estar/mesa-de-centro, /moveis-e-decoracao/sala-de-estar/poltrona, /moveis-e-decoracao/quarto/guarda-roupa, /moveis-e-decoracao/quarto/cama, /moveis-e-decoracao/cozinha/mesas-e-cadeiras, /eletro/eletrodomesticos/refrigerador, /eletro/eletrodomesticos/fogao, /tecnologia/som-e-imagem/tv. Prefira itens coerentes com o tipo de cômodo.
6. ESPAÇO LIVRE (estimatedAvailableCm):
   - Estime, em cm, a largura, a altura e a profundidade livres no ponto marcado, olhando a foto (paredes, janelas, móveis existentes, pé-direito típico de 250–280 cm). Se não der para estimar, use as medidas informadas.

7. MÓVEIS EXISTENTES (detectedObjects):
${DETECT_INSTRUCTIONS}

Retorne em JSON estrito seguindo este formato:
`;

    parts.push({ text: promptText });

    let ai;
    try {
      ai = await generateJson({
      parts,
      schema: ANALYZE_JSON_SCHEMA,
      schemaName: "room_analysis",
      free: FREE_ANALYSIS_SPEC,
      geminiParams: {
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            roomType: { type: Type.STRING },
            floorType: { type: Type.STRING },
            backgroundAnalysis: {
              type: Type.OBJECT,
              properties: {
                lightSourceLocation: { type: Type.STRING, description: "ex: 'Janela lateral à direita'" },
                lightTemperature: { type: Type.STRING, description: "ex: 'Luz natural diurna neutra (5000K)' ou 'Luz quente amarelada (2700K)'" },
                floorPlaneAngleDeg: { type: Type.NUMBER, description: "Inclinação do piso em graus (-15 a 15)" },
                shadowDirection: { type: Type.STRING, description: "'left', 'right', 'front', 'back' ou 'omni'" },
                shadowAngleDeg: { type: Type.NUMBER, description: "Ângulo de projeção da sombra (-60 a 60 graus)" },
                shadowBlurPx: { type: Type.NUMBER, description: "Desfoque da sombra no chão (8 a 25 px)" },
                shadowOpacity: { type: Type.NUMBER, description: "Opacidade ideal da sombra (0.3 a 0.9)" },
                detectedObstacles: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                "lightSourceLocation",
                "lightTemperature",
                "floorPlaneAngleDeg",
                "shadowDirection",
                "shadowAngleDeg",
                "shadowBlurPx",
                "shadowOpacity",
                "detectedObstacles",
              ],
            },
            fitStatus: { type: Type.STRING, description: "'optimal', 'tight', or 'exceeds'" },
            fitSummary: { type: Type.STRING },
            designTips: { type: Type.STRING },
            ergonomicWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            colorHarmonyScore: { type: Type.NUMBER },
            recommendedScaleFactor: { type: Type.NUMBER, description: "Fator de escala recomendado (0.8 a 1.2)" },
            photoQuality: {
              type: Type.OBJECT,
              properties: {
                ok: { type: Type.BOOLEAN },
                issues: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["ok", "issues"],
            },
            styleProfile: {
              type: Type.OBJECT,
              properties: {
                style: { type: Type.STRING },
                dominantColors: { type: Type.ARRAY, items: { type: Type.STRING } },
                suggestions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      query: { type: Type.STRING },
                      categoryPath: { type: Type.STRING },
                    },
                    required: ["label", "query"],
                  },
                },
              },
              required: ["style", "dominantColors", "suggestions"],
            },
            detectedObjects: { type: Type.ARRAY, items: detectedObjectSchema },
            estimatedAvailableCm: {
              type: Type.OBJECT,
              properties: {
                widthCm: { type: Type.NUMBER },
                heightCm: { type: Type.NUMBER },
                depthCm: { type: Type.NUMBER },
              },
              required: ["widthCm", "heightCm", "depthCm"],
            },
          },
          required: [
            "roomType",
            "floorType",
            "backgroundAnalysis",
            "fitStatus",
            "fitSummary",
            "designTips",
            "ergonomicWarnings",
            "colorHarmonyScore",
            "photoQuality",
            "styleProfile",
            "estimatedAvailableCm",
            "detectedObjects",
          ],
        },
      },
      },
      });
    } catch (aiError) {
      if (!(aiError instanceof RateLimitError)) {
        const text = aiError instanceof AllModelsUnavailableError ? aiError.message : "A IA está indisponível no momento; mostrando a análise padrão.";
        aiFailures.set(imageHash, { until: Date.now() + AI_FAILURE_TTL_MS, reason: text });
      }
      throw aiError;
    }
    const { text: resultText, provider, model } = ai;

    const parsedData = JSON.parse(resultText);
    parsedData.detectionApproximate = ai.approximate;
    // Garante 3–6 sugestões e remove sugestões sem busca
    parsedData.detectedObjects = toDetectedObjects(parsedData?.detectedObjects);
    if (Array.isArray(parsedData?.styleProfile?.suggestions)) {
      parsedData.styleProfile.suggestions = parsedData.styleProfile.suggestions
        .filter((x: { query?: unknown }) => typeof x?.query === "string" && x.query.trim())
        .slice(0, 6);
    }

    if (analysisCache.size >= CACHE_LIMIT) {
      analysisCache.delete(analysisCache.keys().next().value!);
    }
    analysisCache.set(key, parsedData);

    return NextResponse.json({
      success: true,
      analysis: parsedData,
      model,
      provider,
    });
  } catch (error: unknown) {
    const reason =
      error instanceof AllModelsUnavailableError || error instanceof RateLimitError || error instanceof RecentAiFailureError
        ? error.message
        : `Falha na análise com IA: ${String((error as Error)?.message ?? error).split("\n")[0].slice(0, 200)}`;
    console.warn(reason);
    // Análise padrão, sinalizada como tal para a interface.
    // O encaixe é calculado pelas medidas (não pela IA); sem medidas do produto, assume-se "tight" por prudência.
    const dims = fb?.product?.dimensions;
    const um = fb?.userMeasurements;
    const fallbackFit =
      dims?.widthCm && dims?.heightCm && dims?.depthCm && um?.widthCm && um?.heightCm && um?.depthCm
        ? evaluateFit(
            { dimensions: { widthCm: dims.widthCm, heightCm: dims.heightCm, depthCm: dims.depthCm, openDepthCm: dims.openDepthCm } },
            { widthCm: um.widthCm, heightCm: um.heightCm, depthCm: um.depthCm }
          )
        : null;
    return NextResponse.json({
      fallbackReason: reason,
      success: true,
      analysis: {
        roomType: "Sala de Estar Residencial",
        floorType: "Piso cerâmico/porcelanato com reflexo suave",
        backgroundAnalysis: {
          lightSourceLocation: "Iluminação natural lateral e luz de teto difusa",
          lightTemperature: "Luz neutra equilibrada",
          floorPlaneAngleDeg: -3,
          shadowDirection: "left",
          shadowAngleDeg: -25,
          shadowBlurPx: 14,
          shadowOpacity: 0.65,
          detectedObstacles: ["Rodapé de 10cm", "Ponto de passagem lateral"],
        },
        fitStatus: fallbackFit?.status ?? "tight",
        fitSummary:
          fallbackFit?.summary ??
          "Não foi possível calcular o encaixe: faltam as medidas do produto ou do espaço. Confira as medidas antes de comprar.",
        designTips: "O tom e acabamento do item integram-se de forma coesa com a paleta de cores predominante na foto.",
        ergonomicWarnings: [
          "Mantenha no mínimo 60cm livres de circulação à frente.",
          "Verifique a proximidade de tomadas caso seja um eletrodoméstico.",
        ],
        colorHarmonyScore: 70,
        detectedObjects: [],
        recommendedScaleFactor: 1.0,
      },
      fallback: true,
    }, { status: error instanceof RateLimitError ? 429 : 200 });
  }
}
