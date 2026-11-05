/**
 * Cliente das APIs públicas da plataforma VTEX usada pelo site benoit.com.br.
 *
 * - Intelligent Search: busca por texto, filtro por categoria, paginação e ordenação
 * - Catalog System: produto pelo link (/p) e árvore de categorias
 *
 * Uso exclusivo no servidor (rotas de API).
 */
import type { BenoitProduct } from "@/data/benoit-catalog";

const BASE_URL = "https://www.benoit.com.br";
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

export const SORT_OPTIONS = {
  relevance: "Relevância",
  "orders:desc": "Mais vendidos",
  "price:asc": "Menor preço",
  "price:desc": "Maior preço",
  "discount:desc": "Maior desconto",
  "release:desc": "Lançamentos",
} as const;
export type SortOption = keyof typeof SORT_OPTIONS;

export interface CategoryGroup {
  name: string;
  path: string;
  children: { name: string; path: string }[];
}

export interface SearchResult {
  products: BenoitProduct[];
  total: number;
  page: number;
  pageCount: number;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, revalidateSeconds = 300): Promise<T> {
  const res = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(15000),
    next: { revalidate: revalidateSeconds },
  });
  // A API de catálogo responde 206 (Partial Content) em buscas paginadas
  if (!res.ok && res.status !== 206) {
    throw new Error(`Benoit API ${res.status} em ${url}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Conversão do produto VTEX para BenoitProduct
// ---------------------------------------------------------------------------

/* Formato mínimo comum às respostas do Intelligent Search e do Catalog System */
interface VtexOffer {
  Price?: number;
  ListPrice?: number;
  AvailableQuantity?: number;
  Installments?: { Value: number; InterestRate: number; NumberOfInstallments: number }[];
}
interface VtexProduct {
  productId: string;
  productName: string;
  brand?: string;
  linkText?: string;
  link?: string;
  description?: string;
  categories?: string[];
  specificationGroups?: { name: string; specifications: { name: string; values: string[] }[] }[];
  items?: {
    itemId: string;
    images?: { imageUrl: string }[];
    sellers?: { sellerId?: string; commertialOffer?: VtexOffer }[];
  }[];
  [key: string]: unknown;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Lê uma especificação pelo nome (grupos do Intelligent Search ou chaves do Catalog System). */
function getSpec(p: VtexProduct, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const g of p.specificationGroups ?? []) {
    if (g.name === "allSpecifications") continue;
    for (const s of g.specifications ?? []) {
      if (s.name.toLowerCase() === target && s.values?.[0]) return s.values[0];
    }
  }
  const direct = p[name];
  if (Array.isArray(direct) && typeof direct[0] === "string") return direct[0];
  return undefined;
}

/** Converte "186,8cm", "1,86 m", "720mm" ou "72" para centímetros. */
function parseMeasureCm(raw?: string): number | undefined {
  if (!raw) return undefined;
  const m = raw.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\b/);
  if (!m) return undefined;
  let v = parseFloat(m[1].replace(",", "."));
  const unit = m[2];
  if (unit === "mm") v /= 10;
  else if (unit === "m" || (!unit && v < 5)) v *= 100;
  return v > 0 ? Math.round(v * 10) / 10 : undefined;
}

/** "168 x 62 x 63,4cm" → altura × largura × profundidade (convenção da ficha da Benoit). */
function parseTriple(raw?: string) {
  const m = raw?.match(/(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/);
  if (!m) return undefined;
  const unit = m[4] ?? "cm";
  const [h, w, d] = [m[1], m[2], m[3]].map((n) => parseMeasureCm(`${n}${unit}`));
  return h && w && d ? { heightCm: h, widthCm: w, depthCm: d } : undefined;
}

type ProductCategory = BenoitProduct["category"];

function categorize(path: string, name: string): ProductCategory {
  const t = `${path} ${name}`.toLowerCase();
  if (/sof[aá]|estofad|poltrona|puff|sala de estar|rack|painel|estante|mesa de centro|aparador|buffet/.test(t)) return "estofados";
  if (/eletrodom|refrigerador|geladeira|fog[aã]o|cooktop|lavadora|secadora|freezer|micro-ondas|forno|lava-lou[cç]a|frigobar/.test(t)) return "linha-branca";
  if (/quarto|guarda.roupa|roupeiro|cama|colch[aã]o|c[oô]moda|cabeceira|box/.test(t)) return "dormitorios";
  if (/cozinha|mesas e cadeiras|banqueta/.test(t)) return "cozinha";
  if (/som e imagem|\btv\b|televis|home theater/.test(t)) return "tvs-audio";
  return "outros";
}

const DEFAULT_DIMENSIONS: Record<ProductCategory, { widthCm: number; heightCm: number; depthCm: number }> = {
  estofados: { widthCm: 200, heightCm: 95, depthCm: 90 },
  "linha-branca": { widthCm: 70, heightCm: 180, depthCm: 72 },
  dormitorios: { widthCm: 200, heightCm: 220, depthCm: 55 },
  cozinha: { widthCm: 120, heightCm: 80, depthCm: 80 },
  "tvs-audio": { widthCm: 125, heightCm: 75, depthCm: 20 },
  outros: { widthCm: 100, heightCm: 100, depthCm: 60 },
};

function extractDimensions(p: VtexProduct, category: ProductCategory) {
  const weightKg = parseFloat((getSpec(p, "Peso (kg)") ?? "").replace(",", ".")) || undefined;

  // 1. Grupo "Medidas" (Altura / Largura / Profundidade)
  const h = parseMeasureCm(getSpec(p, "Altura"));
  const w = parseMeasureCm(getSpec(p, "Largura"));
  const d = parseMeasureCm(getSpec(p, "Profundidade"));
  if (h && w && d) {
    return { dims: { widthCm: w, heightCm: h, depthCm: d, weightKg }, source: "oficial" as const };
  }

  // 2. "Dimensões (axlxp)"
  const triple = parseTriple(getSpec(p, "Dimensões (axlxp)"));
  if (triple) return { dims: { ...triple, weightKg }, source: "oficial" as const };

  // 3. Medidas no nome do produto (ex.: "92x170x80cm")
  const fromName = parseTriple(p.productName);
  if (fromName) return { dims: { ...fromName, weightKg }, source: "estimada" as const };

  // 4. Padrão da categoria, aproveitando o que existir
  const def = DEFAULT_DIMENSIONS[category];
  return {
    dims: { widthCm: w ?? def.widthCm, heightCm: h ?? def.heightCm, depthCm: d ?? def.depthCm, weightKg },
    source: "estimada" as const,
  };
}

interface PickedOffer {
  offer: VtexOffer;
  itemId?: string;
  sellerId?: string;
}

/** Escolhe a primeira oferta disponível e devolve junto o SKU (itemId) e o vendedor dela. */
function pickOffer(p: VtexProduct): PickedOffer {
  for (const item of p.items ?? []) {
    for (const seller of item.sellers ?? []) {
      const o = seller.commertialOffer;
      if (o && (o.AvailableQuantity ?? 0) > 0 && (o.Price ?? 0) > 0) {
        return { offer: o, itemId: item.itemId, sellerId: seller.sellerId };
      }
    }
  }
  const item = p.items?.[0];
  const seller = item?.sellers?.[0];
  return { offer: seller?.commertialOffer ?? {}, itemId: item?.itemId, sellerId: seller?.sellerId };
}

/** Número de uma especificação ("117", "33.7", "33,7"). */
function specNumber(p: VtexProduct, name: string): number | undefined {
  const v = parseFloat((getSpec(p, name) ?? "").replace(",", "."));
  return v > 0 ? v : undefined;
}

/** Medidas da caixa de entrega (especificações "Embalagem - ..."). */
function extractPackage(p: VtexProduct): BenoitProduct["packageDimensions"] {
  const widthCm = specNumber(p, "Embalagem - largura (cm)");
  const heightCm = specNumber(p, "Embalagem - altura (cm)");
  const depthCm = specNumber(p, "Embalagem - comprimento (cm)");
  if (!widthCm || !heightCm || !depthCm) return undefined;
  return { widthCm, heightCm, depthCm, weightKg: specNumber(p, "Embalagem - peso (kg)") };
}

/**
 * ESTIMATIVA (heurística pelo nome/categoria, não vem da ficha técnica): profundidade ocupada
 * com portas abertas ou mecanismo em uso. Retorna undefined quando o móvel não "abre".
 */
function estimateOpenDepth(
  name: string,
  categoryPath: string,
  d: { widthCm: number; depthCm: number }
): number | undefined {
  const n = name.toLowerCase();
  const t = `${categoryPath} ${name}`.toLowerCase();
  const round = (v: number) => Math.round(v * 10) / 10;

  if (/geladeira|refrigerador|freezer vertical/.test(t) && !/frigobar/.test(t)) {
    if (/side by side|french door|\bfrench\b|inverse|4 portas/.test(n)) return round(d.depthCm + d.widthCm / 2);
    return round(d.depthCm + d.widthCm); // porta única / duplex
  }
  if (/fog[aã]o|forno/.test(n) && !/micro-?ondas|cooktop/.test(n)) return round(d.depthCm + 45);
  if (/lava-?lou[cç]a/.test(n)) return round(d.depthCm + 55);
  if (/lava e seca|lavadora|secadora/.test(n) && /frontal|lava e seca/.test(n)) return round(d.depthCm + 50);
  if (/sof[aá]/.test(n) && /reclin[aá]vel|reclin/.test(n)) return round(d.depthCm + 40);
  if (/sof[aá]/.test(n) && /retr[aá]til/.test(n)) return round(d.depthCm + 50);
  if (/guarda-?roupa|roupeiro/.test(n) && !/corre/.test(n)) return round(d.depthCm + 50);
  return undefined;
}

function formatInstallment(o: VtexOffer, price: number): string {
  const options = o.Installments ?? [];
  const noInterest = options
    .filter((i) => i.InterestRate === 0)
    .sort((a, b) => b.NumberOfInstallments - a.NumberOfInstallments)[0];
  if (noInterest && noInterest.NumberOfInstallments > 1) {
    return `${noInterest.NumberOfInstallments}x de ${brl(noInterest.Value)} sem juros`;
  }
  const longest = [...options].sort((a, b) => b.NumberOfInstallments - a.NumberOfInstallments)[0];
  if (longest && longest.NumberOfInstallments > 1) {
    return `até ${longest.NumberOfInstallments}x de ${brl(longest.Value)}`;
  }
  return price > 0 ? `${brl(price)} à vista` : "Consulte disponibilidade";
}

function stripHtml(s?: string) {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function toBenoitProduct(p: VtexProduct): BenoitProduct {
  const categoryPath = p.categories?.[0] ?? "";
  const category = categorize(categoryPath, p.productName);
  const categoryName = categoryPath.split("/").filter(Boolean).pop() ?? "Benoit";
  const { dims, source } = extractDimensions(p, category);

  const { offer, itemId, sellerId } = pickOffer(p);
  const price = offer.Price ?? 0;
  const listPrice = offer.ListPrice ?? 0;
  const available = (offer.AvailableQuantity ?? 0) > 0;

  // Variações (ex.: 110V/220V) recadastram as mesmas fotos com outro id; deduplica pelo nome do arquivo
  const imageById = new Map<string, string>();
  for (const img of (p.items ?? []).flatMap((i) => i.images ?? [])) {
    const key = img.imageUrl.match(/\/ids\/\d+\/([^?]+)/)?.[1] ?? img.imageUrl;
    if (!imageById.has(key)) imageById.set(key, img.imageUrl);
  }
  const images = [...imageById.values()];

  const specs: { label: string; value: string }[] = [];
  for (const g of p.specificationGroups ?? []) {
    if (g.name === "allSpecifications") continue;
    for (const s of g.specifications ?? []) {
      if (specs.length >= 8) break;
      if (/embalagem|informa[cç][oõ]es|registro|itens inclusos/i.test(s.name) || !s.values?.[0]) continue;
      if (!specs.some((x) => x.label === s.name)) specs.push({ label: s.name, value: s.values[0] });
    }
  }

  const link = p.link ?? `/${p.linkText}/p`;
  const description = stripHtml(p.description);

  return {
    id: `benoit-${p.productId}`,
    sku: itemId ?? p.items?.[0]?.itemId ?? p.productId,
    sellerId: sellerId ?? "1",
    packageDimensions: extractPackage(p),
    name: p.productName,
    brand: p.brand || "Benoit",
    category,
    categoryLabel: categoryName,
    price,
    originalPrice: listPrice > price ? listPrice : undefined,
    installment: formatInstallment(offer, price),
    dimensions: { ...dims, openDepthCm: estimateOpenDepth(p.productName, categoryPath, dims) },
    dimensionsSource: source,
    available,
    imageUrl: images[0] ?? "",
    images,
    badge: listPrice > price ? `-${Math.round((1 - price / listPrice) * 100)}%` : undefined,
    color: getSpec(p, "Cor") ?? "Padrão",
    productUrl: link.startsWith("http") ? link : `${BASE_URL}${link}`,
    description: description || `${p.productName} — disponível em benoit.com.br`,
    specs,
    clearanceRequirements: {
      minSideCm: category === "linha-branca" ? 5 : 10,
      minTopCm: 10,
      minFrontCm: category === "tvs-audio" ? 0 : 60,
      warningNote:
        source === "oficial"
          ? "Medidas da ficha técnica oficial da Benoit."
          : "Medidas estimadas: confira a ficha técnica antes da compra.",
    },
  };
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

/** "/moveis-e-decoracao/sala-de-estar/sofa" → "category-1/moveis-e-decoracao/category-2/..." */
function categoryPathToFacets(path?: string) {
  const parts = (path ?? "").split("/").filter(Boolean).map(encodeURIComponent);
  return parts.map((seg, i) => `category-${i + 1}/${seg}`).join("/");
}

export async function searchProducts(opts: {
  query?: string;
  categoryPath?: string;
  page?: number;
  count?: number;
  sort?: SortOption;
}): Promise<SearchResult> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const count = Math.min(50, Math.max(1, Math.floor(opts.count ?? 24)));
  const params = new URLSearchParams({
    page: String(page),
    count: String(count),
    locale: "pt-BR",
    hideUnavailableItems: "true",
  });
  if (opts.query?.trim()) params.set("query", opts.query.trim());
  if (opts.sort && opts.sort !== "relevance") params.set("sort", opts.sort);

  const facets = categoryPathToFacets(opts.categoryPath);
  const url = `${BASE_URL}/api/io/_v/api/intelligent-search/product_search/${facets}?${params}`;
  const data = await fetchJson<{ products?: VtexProduct[]; recordsFiltered?: number }>(url);

  const total = data.recordsFiltered ?? 0;
  return {
    products: (data.products ?? []).map(toBenoitProduct),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / count)),
  };
}

// ---------------------------------------------------------------------------
// Links colados pelo usuário
// ---------------------------------------------------------------------------

export type ParsedBenoitUrl =
  | { kind: "product"; linkText: string }
  | { kind: "category"; categoryPath: string; query?: string }
  | { kind: "search"; query: string };

/** Interpreta o texto da barra de endereço: link de produto, de categoria ou busca livre. */
export function parseBenoitInput(input: string): ParsedBenoitUrl | null {
  const text = input.trim();
  if (!text) return null;

  const looksLikeUrl = /^https?:\/\//i.test(text) || /^(www\.)?benoit\.com\.br/i.test(text);
  if (!looksLikeUrl) return { kind: "search", query: text };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  // Só aceitamos o domínio da Benoit (evita que a rota seja usada para acessar outros endereços)
  if (!/(^|\.)benoit\.com\.br$/i.test(url.hostname)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.at(-1) === "p" && segments.length >= 2) {
    return { kind: "product", linkText: segments.at(-2)! };
  }
  const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? undefined;
  if (segments.length === 0 || segments[0] === "s") {
    return q ? { kind: "search", query: q } : null;
  }
  return { kind: "category", categoryPath: `/${segments.join("/")}`, query: q };
}

export async function getProductByLinkText(linkText: string): Promise<BenoitProduct | null> {
  // Alguns links trazem o código do SKU no fim (ex.: "...-111628-1990"); tentamos com e sem ele
  const candidates = [linkText, linkText.replace(/-\d+$/, "")].filter(
    (v, i, arr) => v && arr.indexOf(v) === i
  );
  for (const slug of candidates) {
    const data = await fetchJson<VtexProduct[]>(
      `${BASE_URL}/api/catalog_system/pub/products/search/${encodeURIComponent(slug)}/p`
    );
    if (data?.[0]) return toBenoitProduct(data[0]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Árvore de categorias
// ---------------------------------------------------------------------------

interface VtexCategory {
  name: string;
  url: string;
  hasChildren?: boolean;
  children?: VtexCategory[];
}

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
};

/**
 * Categorias que fazem sentido no simulador de ambientes:
 * todos os grupos de Móveis e Decoração, Eletrodomésticos e Som e Imagem.
 */
export async function getCategoryGroups(): Promise<CategoryGroup[]> {
  const tree = await fetchJson<VtexCategory[]>(
    `${BASE_URL}/api/catalog_system/pub/category/tree/3`,
    3600
  );
  const find = (list: VtexCategory[] | undefined, re: RegExp) => list?.find((c) => re.test(c.name));

  const moveis = find(tree, /^m[oó]veis/i)?.children ?? [];
  const eletrodomesticos = find(find(tree, /^eletro$/i)?.children, /^eletrodom/i);
  const somImagem = find(find(tree, /^tecnologia/i)?.children, /^som e imagem/i);

  const notForRoomSimulation = /rodap[eé]|seguran[cç]a|industrial/i;

  return [...moveis, eletrodomesticos, somImagem]
    .filter((g): g is VtexCategory => Boolean(g) && !notForRoomSimulation.test(g!.name))
    .map((g) => ({
      name: g.name,
      path: pathOf(g.url),
      children: (g.children ?? []).map((c) => ({ name: c.name, path: pathOf(c.url) })),
    }));
}

// ---------------------------------------------------------------------------
// Frete e retirada (simulação do checkout VTEX)
// ---------------------------------------------------------------------------

export interface ShippingLineInput {
  sku: string;
  sellerId?: string;
  quantity: number;
}

export interface DeliveryOption {
  name: string;
  /** Valor total do frete do carrinho, em reais */
  price: number;
  /** Maior prazo entre os itens, em dias (úteis quando a Benoit informa "bd") */
  days: number | null;
  /** Texto pronto, ex.: "3 dias úteis" */
  estimateLabel: string;
}

export interface PickupOption {
  name: string;
  friendlyName: string;
  address: string;
  price: number;
  days: number | null;
  estimateLabel: string;
}

export interface ShippingResult {
  postalCode: string;
  /** Entrega no endereço; null se algum item não pode ser entregue nesse CEP */
  delivery: DeliveryOption | null;
  /** Lojas onde TODOS os itens podem ser retirados */
  pickups: PickupOption[];
  /** SKUs que não podem ser entregues no CEP */
  unavailableSkus: string[];
  messages: string[];
}

interface VtexSla {
  name: string;
  deliveryChannel: string;
  price: number;
  shippingEstimate?: string;
  pickupStoreInfo?: {
    friendlyName?: string;
    address?: { city?: string; street?: string; number?: string; neighborhood?: string } | null;
  };
}
interface VtexSimulation {
  items?: { id: string; availability?: string }[];
  messages?: { text?: string }[];
  logisticsInfo?: { itemIndex: number; slas?: VtexSla[] }[];
}

/** "3bd" → 3 dias úteis; "2d" → 2 dias; "4h" → 1 dia. */
function parseEstimate(est?: string): { days: number | null; label: string } {
  const m = est?.match(/^(\d+)(bd|d|h|m)$/i);
  if (!m) return { days: null, label: "Prazo a consultar" };
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === "bd") return { days: n, label: `${n} ${n === 1 ? "dia útil" : "dias úteis"}` };
  if (unit === "d") return { days: n, label: `${n} ${n === 1 ? "dia" : "dias"}` };
  return { days: 1, label: "Em até 1 dia" };
}

/** A Benoit/VTEX respondeu 429; `retryAfterSeconds` vem do cabeçalho Retry-After. */
export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Muitas consultas de frete. Tente novamente em instantes.");
  }
}

/**
 * Simula frete/retirada de um carrinho inteiro para um CEP.
 * Entrega: soma dos preços e maior prazo entre os itens.
 * Retirada: somente lojas que aparecem como retirada em TODOS os itens.
 */
export async function simulateShipping(
  lines: ShippingLineInput[],
  postalCode: string
): Promise<ShippingResult> {
  const cep = postalCode.replace(/\D/g, "");
  const res = await fetch(`${BASE_URL}/api/checkout/pub/orderForms/simulation?sc=1`, {
    method: "POST",
    headers: { ...REQUEST_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: lines.map((l) => ({ id: l.sku, quantity: l.quantity, seller: l.sellerId ?? "1" })),
      postalCode: cep,
      country: "BRA",
    }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (res.status === 429) {
    const retry = parseInt(res.headers.get("retry-after") ?? "", 10);
    throw new RateLimitError(Number.isFinite(retry) ? retry : 30);
  }
  if (!res.ok) throw new Error(`Simulação de frete falhou (${res.status})`);
  const data = (await res.json()) as VtexSimulation;

  const messages = (data.messages ?? []).map((m) => m.text ?? "").filter(Boolean);
  const unavailableSkus: string[] = [];
  lines.forEach((l, i) => {
    const item = data.items?.[i];
    if (!item || item.availability !== "available") unavailableSkus.push(l.sku);
  });

  const infos = lines.map((_, i) => data.logisticsInfo?.find((li) => li.itemIndex === i)?.slas ?? []);

  // Entrega: por item, o SLA de entrega mais barato (desempate: mais rápido)
  let delivery: DeliveryOption | null = null;
  if (infos.length > 0 && unavailableSkus.length === 0) {
    const perItem = infos.map((slas) =>
      slas
        .filter((s) => s.deliveryChannel === "delivery")
        .map((s) => ({ s, est: parseEstimate(s.shippingEstimate) }))
        .sort((a, b) => a.s.price - b.s.price || (a.est.days ?? 99) - (b.est.days ?? 99))[0]
    );
    if (perItem.every(Boolean)) {
      const total = perItem.reduce((sum, o) => sum + o.s.price, 0);
      const known = perItem.map((o) => o.est.days);
      const days = known.some((d) => d == null) ? null : Math.max(...(known as number[]));
      const longest = perItem.find((o) => o.est.days === days) ?? perItem[0];
      delivery = {
        name: longest.s.name,
        price: total / 100,
        days,
        estimateLabel: days == null ? "Prazo a consultar" : longest.est.label,
      };
    }
  }

  // Retirada: lojas presentes em todos os itens
  const pickups: PickupOption[] = [];
  if (infos.length > 0) {
    const byStore = new Map<string, { sla: VtexSla; days: (number | null)[]; price: number; count: number }>();
    for (const slas of infos) {
      const seen = new Set<string>();
      for (const s of slas.filter((x) => x.deliveryChannel === "pickup-in-point")) {
        if (seen.has(s.name)) continue;
        seen.add(s.name);
        const entry = byStore.get(s.name) ?? { sla: s, days: [], price: 0, count: 0 };
        entry.days.push(parseEstimate(s.shippingEstimate).days);
        entry.price += s.price;
        entry.count += 1;
        byStore.set(s.name, entry);
      }
    }
    for (const [name, e] of byStore) {
      if (e.count !== infos.length) continue;
      const days = e.days.some((d) => d == null) ? null : Math.max(...(e.days as number[]));
      const a = e.sla.pickupStoreInfo?.address;
      const address = a
        ? [[a.street, a.number].filter(Boolean).join(", "), a.neighborhood, a.city].filter(Boolean).join(" - ")
        : "";
      pickups.push({
        name,
        friendlyName: e.sla.pickupStoreInfo?.friendlyName ?? name,
        address,
        price: e.price / 100,
        days,
        estimateLabel: days == null ? "Prazo a consultar" : parseEstimate(`${days}bd`).label,
      });
    }
    pickups.sort((a, b) => (a.days ?? 99) - (b.days ?? 99) || a.friendlyName.localeCompare(b.friendlyName));
  }

  return { postalCode: cep, delivery, pickups, unavailableSkus, messages };
}

// ---------------------------------------------------------------------------
// Variações (cada cor é um produto separado na Benoit)
// ---------------------------------------------------------------------------

const normalizeName = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Remove o sufixo de cor (" - CHUMBO", " - CINZA CLARO") do nome do produto. */
export function stripColorSuffix(name: string): string {
  return name.replace(/\s+-\s+[A-ZÀ-Ý][A-ZÀ-Ý0-9 /.,+]*$/, "").trim();
}

/** Produtos que são o mesmo modelo em outras cores/variações (exclui `excludeId`). */
export async function findVariants(name: string, excludeId?: string): Promise<BenoitProduct[]> {
  const base = stripColorSuffix(name);
  const normBase = normalizeName(base);
  if (!normBase) return [];
  const { products } = await searchProducts({ query: base, count: 50 });
  const seen = new Set<string>();
  return products.filter((p) => {
    if (p.id === excludeId || seen.has(p.id)) return false;
    seen.add(p.id);
    return normalizeName(p.name).startsWith(normBase);
  });
}

