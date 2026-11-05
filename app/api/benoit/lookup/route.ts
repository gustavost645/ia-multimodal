import { NextRequest, NextResponse } from "next/server";
import { BENOIT_CATALOG } from "@/data/benoit-catalog";
import {
  SORT_OPTIONS,
  SortOption,
  getProductByLinkText,
  parseBenoitInput,
  searchProducts,
} from "@/lib/benoit-api";

export const dynamic = "force-dynamic";

// Atalhos antigos de categoria (mantidos por compatibilidade)
const LEGACY_CATEGORY_PATHS: Record<string, string> = {
  all: "/moveis-e-decoracao/sala-de-estar/sofa",
  estofados: "/moveis-e-decoracao/sala-de-estar/sofa",
  sofa: "/moveis-e-decoracao/sala-de-estar/sofa",
  poltrona: "/moveis-e-decoracao/sala-de-estar/poltrona",
  "linha-branca": "/eletro/eletrodomesticos/refrigerador",
  refrigerador: "/eletro/eletrodomesticos/refrigerador",
  geladeira: "/eletro/eletrodomesticos/refrigerador",
  fogao: "/eletro/eletrodomesticos/fogao",
  lavadora: "/eletro/eletrodomesticos/lavadora",
  dormitorios: "/moveis-e-decoracao/quarto/guarda-roupa",
  "guarda-roupa": "/moveis-e-decoracao/quarto/guarda-roupa",
  "tvs-audio": "/tecnologia/som-e-imagem/tv",
  tv: "/tecnologia/som-e-imagem/tv",
};

/**
 * POST /api/benoit/lookup
 * Corpo (todos opcionais):
 *  - url:          link de produto (/p), de categoria, ou texto livre de busca
 *  - query:        texto de busca
 *  - categoryPath: caminho da categoria (ex.: "/moveis-e-decoracao/sala-de-estar/sofa")
 *  - category:     atalho antigo de categoria (ex.: "estofados")
 *  - page, count, sort
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const page = Number(body.page) || 1;
  const count = Number(body.count) || 24;
  const sort: SortOption = str(body.sort) && Object.hasOwn(SORT_OPTIONS, str(body.sort)!) ? (body.sort as SortOption) : "relevance";

  let query = str(body.query);
  let categoryPath =
    str(body.categoryPath) ?? (str(body.category) ? LEGACY_CATEGORY_PATHS[str(body.category)!] : undefined);

  try {
    // 1. Texto da barra de endereço: produto, categoria ou busca
    const urlInput = str(body.url);
    if (urlInput) {
      const parsed = parseBenoitInput(urlInput);
      if (!parsed) {
        return NextResponse.json(
          { error: "Use um link do site benoit.com.br ou digite o nome do produto." },
          { status: 400 }
        );
      }
      if (parsed.kind === "product") {
        const product = await getProductByLinkText(parsed.linkText);
        if (!product) {
          return NextResponse.json({ error: "Produto não encontrado no site da Benoit." }, { status: 404 });
        }
        return NextResponse.json({ success: true, isCategory: false, product, source: "benoit_catalog_api" });
      }
      if (parsed.kind === "category") {
        categoryPath = parsed.categoryPath;
        query = parsed.query ?? query;
      } else {
        query = parsed.query;
        categoryPath = undefined;
      }
    }

    // 2. Busca (texto e/ou categoria), paginada
    if (!query && !categoryPath) categoryPath = LEGACY_CATEGORY_PATHS.estofados;
    const result = await searchProducts({ query, categoryPath, page, count, sort });

    return NextResponse.json({
      success: true,
      isCategory: true,
      ...result,
      query: query ?? null,
      categoryPath: categoryPath ?? null,
      sort,
      source: "benoit_intelligent_search",
    });
  } catch (error) {
    console.error("Erro ao consultar a Benoit:", error);
    // Site fora do ar: usa o catálogo local, deixando claro que é o catálogo de apoio
    return NextResponse.json({
      success: true,
      isCategory: true,
      products: BENOIT_CATALOG,
      total: BENOIT_CATALOG.length,
      page: 1,
      pageCount: 1,
      source: "curated_fallback",
      warning: "Não foi possível acessar o site da Benoit agora. Mostrando o catálogo de demonstração.",
    });
  }
}
