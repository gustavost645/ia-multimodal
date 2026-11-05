/**
 * Tipo simples de móvel/eletro (mesmo vocabulário de DetectedObject.kind). Funções puras, sem rede.
 */
import type { BenoitProduct } from "@/data/benoit-catalog";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Ordem importa: padrões mais específicos primeiro (ex.: "rack para TV" é rack, "sofá cama" é sofá)
const RULES: [string, RegExp][] = [
  ["rack", /\b(rack|painel|estante|aparador|buffet|home theater|cristaleira|balcao)/],
  ["tv", /\b(smart ?tv|televis|tv|monitor)\b/],
  ["geladeira", /\b(geladeira|refrigerador|frigobar|freezer|side by side)/],
  ["fogao", /\b(fogao|cooktop)/],
  ["lavadora", /\b(lavadora|lava e seca|maquina de lavar|lava-?loucas|secadora)/],
  ["guarda-roupa", /\b(guarda-? ?roupa|roupeiro)/],
  ["comoda", /\b(comoda|sapateira|mesa de cabeceira|criado)/],
  ["poltrona", /\b(poltrona|puff|banqueta|namoradeira)/],
  ["sofa", /\b(sofa|sofanete|estofado|chaise|recamier|divan)/],
  ["cama", /\b(cama|box|colchao|beliche|berco)\b/],
  ["mesa", /\b(mesa|escrivaninha|bancada)/],
  ["cadeira", /\b(cadeira|banco)\b/],
];

const KINDS = new Set(["sofa", "poltrona", "mesa", "cadeira", "rack", "tv", "geladeira", "fogao", "lavadora", "cama", "guarda-roupa", "comoda"]);

/** Tipo do produto a partir de nome, categoria e rótulo da categoria. */
export function productKind(product: BenoitProduct): string {
  const byName = norm(product.name);
  for (const [kind, re] of RULES) if (re.test(byName)) return kind;
  const byCat = norm(`${product.categoryLabel ?? ""} ${product.category ?? ""}`);
  for (const [kind, re] of RULES) if (re.test(byCat)) return kind;
  if (product.category === "estofados") return "sofa";
  if (product.category === "linha-branca") return "geladeira";
  if (product.category === "dormitorios") return "guarda-roupa";
  if (product.category === "tvs-audio") return "tv";
  return "outro";
}

/** Normaliza o tipo vindo da IA (aparador/estante → rack, puff → poltrona etc.). */
function canonical(kind: string): string {
  const k = norm(kind).trim();
  if (k === "aparador" || k === "estante" || k === "buffet" || k === "painel") return "rack";
  if (k === "puff" || k === "banqueta") return "poltrona";
  if (k === "refrigerador") return "geladeira";
  if (k === "roupeiro") return "guarda-roupa";
  return KINDS.has(k) ? k : "outro";
}

/** Dois tipos são equivalentes para fins de "trocar este móvel por este produto". */
export function kindsMatch(a: string, b: string): boolean {
  const x = canonical(a);
  const y = canonical(b);
  if (x === "outro" || y === "outro") return false;
  return x === y;
}

const LABELS: Record<string, string> = {
  sofa: "o sofá",
  poltrona: "a poltrona",
  mesa: "a mesa",
  cadeira: "a cadeira",
  rack: "o rack",
  tv: "a TV",
  geladeira: "a geladeira",
  fogao: "o fogão",
  lavadora: "a lavadora",
  cama: "a cama",
  "guarda-roupa": "o guarda-roupa",
  comoda: "a cômoda",
};

/** Nome em português com artigo, para a interface ("o sofá", "a mesa"…). */
export function kindLabel(kind: string): string {
  return LABELS[canonical(kind)] ?? "o móvel";
}
