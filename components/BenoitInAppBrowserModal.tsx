"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Lock,
  RotateCw,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Search,
  ExternalLink,
  Info,
} from "lucide-react";
import { BenoitProduct } from "@/data/benoit-catalog";
import type { RoomMeasurements } from "@/lib/scene-types";
import { ProductCard, brl } from "@/components/product/ProductCard";
import { FitFilter } from "@/components/product/FitFilter";
import { useFitFilter } from "@/components/product/useFitFilter";

interface BenoitInAppBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: BenoitProduct) => void;
  /** Espaço disponível: habilita o filtro "Cabe no meu espaço" e os selos de encaixe */
  roomMeasurements?: RoomMeasurements;
}

interface CategoryGroup {
  name: string;
  path: string;
  children: { name: string; path: string }[];
}

const BENOIT_HOST = "https://www.benoit.com.br";
const PAGE_SIZE = 24;
const DEFAULT_CATEGORY = { name: "Sofá", path: "/moveis-e-decoracao/sala-de-estar/sofa" };

const SORT_OPTIONS: Record<string, string> = {
  relevance: "Relevância",
  "orders:desc": "Mais vendidos",
  "price:asc": "Menor preço",
  "price:desc": "Maior preço",
  "discount:desc": "Maior desconto",
  "release:desc": "Lançamentos",
};

// Atalhos para as categorias mais usadas no simulador (os caminhos vêm da árvore do site)
const QUICK_CATEGORIES: { label: string; group: RegExp; name: RegExp; fallbackPath: string }[] = [
  { label: "🛋️ Sofás", group: /sala/i, name: /^sof[aá]$/i, fallbackPath: "/moveis-e-decoracao/sala-de-estar/sofa" },
  { label: "🪑 Poltronas", group: /sala/i, name: /^poltrona/i, fallbackPath: "/moveis-e-decoracao/sala-de-estar/poltrona" },
  { label: "📺 Racks e Painéis", group: /sala/i, name: /^racks/i, fallbackPath: "/moveis-e-decoracao/sala-de-estar/racks-e-paineis" },
  { label: "☕ Mesas de centro", group: /sala/i, name: /^mesa de centro/i, fallbackPath: "/moveis-e-decoracao/sala-de-estar/mesa-de-centro" },
  { label: "🚪 Guarda-roupas", group: /^quarto/i, name: /^guarda/i, fallbackPath: "/moveis-e-decoracao/quarto/guarda-roupa" },
  { label: "🛏️ Camas", group: /^quarto/i, name: /^cama$/i, fallbackPath: "/moveis-e-decoracao/quarto/cama" },
  { label: "🗄️ Cômodas", group: /^quarto/i, name: /^c[oô]moda/i, fallbackPath: "/moveis-e-decoracao/quarto/comoda" },
  { label: "🍽️ Mesas e Cadeiras", group: /cozinha/i, name: /^mesas e cadeiras/i, fallbackPath: "/moveis-e-decoracao/cozinha/mesas-e-cadeiras" },
  { label: "❄️ Geladeiras", group: /eletrodom/i, name: /^refrigerador/i, fallbackPath: "/eletro/eletrodomesticos/refrigerador" },
  { label: "🍳 Fogões", group: /eletrodom/i, name: /^fog[aã]o$/i, fallbackPath: "/eletro/eletrodomesticos/fogao" },
  { label: "🧺 Lavadoras", group: /eletrodom/i, name: /^lavadora/i, fallbackPath: "/eletro/eletrodomesticos/lavadora" },
  { label: "📡 Micro-ondas", group: /eletrodom/i, name: /^micro/i, fallbackPath: "/eletro/eletrodomesticos/micro-ondas" },
  { label: "📺 Smart TVs", group: /som e imagem/i, name: /^tv$/i, fallbackPath: "/tecnologia/som-e-imagem/tv" },
];

interface Listing {
  key: string;
  products: BenoitProduct[];
  total: number;
  page: number;
  pageCount: number;
  warning: string;
  error: string;
}
const EMPTY_LISTING: Listing = { key: "", products: [], total: 0, page: 1, pageCount: 1, warning: "", error: "" };

const looksLikeUrl = (s: string) => /^https?:\/\//i.test(s) || /^(www\.)?benoit\.com\.br/i.test(s);

export function BenoitInAppBrowserModal({ isOpen, onClose, onSelectProduct, roomMeasurements }: BenoitInAppBrowserModalProps) {
  // O que está sendo exibido: uma categoria, uma busca por texto, ou as duas
  const [categoryPath, setCategoryPath] = useState<string | null>(DEFAULT_CATEGORY.path);
  const [categoryName, setCategoryName] = useState<string>(DEFAULT_CATEGORY.name);
  const [query, setQuery] = useState<string>("");
  const [sort, setSort] = useState<string>("relevance");
  const [addressBar, setAddressBar] = useState<string>(`${BENOIT_HOST}${DEFAULT_CATEGORY.path}`);

  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  // A listagem guarda para qual busca ela foi carregada; se a busca mudou, está carregando
  const requestKey = JSON.stringify([query, categoryPath, sort, reloadToken]);
  const [listing, setListing] = useState<Listing>(EMPTY_LISTING);
  const { products, total, page, pageCount, warning } = listing;
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [singleImportedProduct, setSingleImportedProduct] = useState<BenoitProduct | null>(null);
  const isLoading = isImporting || (isOpen && listing.key !== requestKey);
  const shownError = errorMessage || listing.error;
  const fit = useFitFilter(products, roomMeasurements);

  // Árvore de categorias do site (carrega uma vez)
  useEffect(() => {
    if (!isOpen || groups.length > 0) return;
    fetch("/api/benoit/categories")
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.groups) && setGroups(d.groups))
      .catch(() => {});
  }, [isOpen, groups.length]);

  const quickCategories = useMemo(
    () =>
      QUICK_CATEGORIES.map((q) => {
        const found = groups.find((g) => q.group.test(g.name))?.children.find((c) => q.name.test(c.name));
        return { label: q.label, name: found?.name ?? q.label.replace(/^\S+\s/, ""), path: found?.path ?? q.fallbackPath };
      }),
    [groups]
  );

  const fetchPage = useCallback(
    async (targetPage: number) => {
      const res = await fetch("/api/benoit/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query || undefined,
          categoryPath: categoryPath || undefined,
          sort,
          page: targetPage,
          count: PAGE_SIZE,
        }),
      });
      return res.json();
    },
    [query, categoryPath, sort]
  );

  // Recarrega a primeira página quando muda categoria, busca ou ordenação
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchPage(1)
      .then((data) => {
        if (cancelled) return;
        setListing({
          key: requestKey,
          products: data?.products ?? [],
          total: data?.total ?? 0,
          page: 1,
          pageCount: data?.pageCount ?? 1,
          warning: data?.warning ?? "",
          error: data?.error ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) setListing({ ...EMPTY_LISTING, key: requestKey, error: "Erro de conexão ao consultar a Benoit." });
      });
    return () => {
      cancelled = true;
    };
    // requestKey resume query, categoryPath, sort e reloadToken (dependências de fetchPage + recarregar)
  }, [isOpen, fetchPage, requestKey]);

  const loadMore = async () => {
    if (isLoadingMore || page >= pageCount) return;
    const key = listing.key;
    setIsLoadingMore(true);
    try {
      const data = await fetchPage(page + 1);
      setListing((prev) =>
        prev.key !== key
          ? prev
          : {
              ...prev,
              page: prev.page + 1,
              products: [
                ...prev.products,
                ...(data?.products ?? []).filter((p: BenoitProduct) => !prev.products.some((x) => x.id === p.id)),
              ],
            }
      );
    } catch {
      setErrorMessage("Não foi possível carregar mais produtos.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const selectCategory = (name: string, path: string) => {
    setErrorMessage("");
    setSingleImportedProduct(null);
    setQuery("");
    setCategoryName(name);
    setCategoryPath(path);
    setAddressBar(`${BENOIT_HOST}${path}`);
  };

  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = addressBar.trim();
    if (!text) return;
    setSingleImportedProduct(null);
    setErrorMessage("");

    // Texto livre: busca em todo o site
    if (!looksLikeUrl(text)) {
      setCategoryPath(null);
      setCategoryName("");
      setQuery(text);
      return;
    }

    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      setErrorMessage("Link inválido.");
      return;
    }
    if (!/(^|\.)benoit\.com\.br$/i.test(url.hostname)) {
      setErrorMessage("Use um link do site benoit.com.br ou digite o nome do produto.");
      return;
    }
    const path = url.pathname.replace(/\/$/, "");

    // Link de categoria: a própria listagem cuida da busca
    if (!path.endsWith("/p")) {
      const name = groups.flatMap((g) => [g, ...g.children]).find((c) => c.path === path)?.name;
      setQuery(url.searchParams.get("q") ?? "");
      setCategoryName(name ?? path.split("/").pop()?.replace(/-/g, " ") ?? "");
      setCategoryPath(path || null);
      return;
    }

    // Link de produto (/p)
    setIsImporting(true);
    try {
      const res = await fetch("/api/benoit/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: text }),
      });
      const data = await res.json();
      if (data?.product) setSingleImportedProduct(data.product);
      else setErrorMessage(data?.error ?? "Não foi possível carregar este link.");
    } catch {
      setErrorMessage("Erro de conexão ao consultar a Benoit.");
    } finally {
      setIsImporting(false);
    }
  };

  const importProduct = (prod: BenoitProduct) => {
    onSelectProduct(prod);
    onClose();
  };

  if (!isOpen) return null;

  const heading = query
    ? `Resultados para “${query}”${categoryName ? ` em ${categoryName}` : ""}`
    : `Categoria: ${categoryName || "Benoit"}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Barra do navegador */}
        <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-2">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
            </div>
            <span className="text-xs font-bold text-slate-700 hidden sm:inline">Navegador Benoit In-App</span>
          </div>

          <form onSubmit={handleAddressSubmit} className="flex-1 max-w-xl mx-3 flex items-center gap-1.5">
            <div className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1 flex items-center gap-2 text-xs text-slate-700 shadow-inner">
              {looksLikeUrl(addressBar) ? (
                <Lock className="w-3.5 h-3.5 text-[#19a565] shrink-0" />
              ) : (
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <input
                type="text"
                value={addressBar}
                onChange={(e) => setAddressBar(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="Busque (ex.: sofá retrátil, geladeira inverse) ou cole um link da Benoit"
                className="w-full bg-transparent text-xs text-slate-800 focus:outline-none font-mono truncate"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="px-3.5 py-1 bg-[#ee3135] hover:bg-[#b12124] text-white text-xs font-bold rounded-lg transition shrink-0 cursor-pointer disabled:opacity-50"
            >
              Ir
            </button>
          </form>

          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-slate-500 hover:text-slate-900 px-2.5 py-1 text-sm font-bold rounded-lg hover:bg-slate-200 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Cabeçalho da loja */}
        <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative h-8 w-28 sm:w-32 shrink-0">
              <Image
                src="https://benoit.vtexassets.com/assets/vtex.file-manager-graphql/images/341ef06b-1214-4805-b873-9922159f1b8b___a5143f79d27c3fade31cbdb6ce4dcfee.svg"
                alt="Benoit"
                fill
                className="object-contain object-left"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="hidden md:flex flex-col border-l border-slate-200 pl-3">
              <span className="text-xs font-bold text-slate-800">Catálogo ao vivo do site benoit.com.br</span>
              <span className="text-[10px] text-slate-500">Preços, parcelamento e medidas da ficha técnica oficial</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={categoryPath ?? ""}
              onChange={(e) => {
                const path = e.target.value;
                const item = groups.flatMap((g) => [g, ...g.children]).find((c) => c.path === path);
                if (item) selectCategory(item.name, item.path);
              }}
              className="max-w-[11rem] text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-700 cursor-pointer"
              aria-label="Todas as categorias"
            >
              <option value="" disabled>
                {groups.length ? "Todas as categorias…" : "Carregando categorias…"}
              </option>
              {groups.map((g) => (
                <optgroup key={g.path} label={g.name}>
                  <option value={g.path}>{g.name} (tudo)</option>
                  {g.children.map((c) => (
                    <option key={c.path} value={c.path}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-700 cursor-pointer"
              aria-label="Ordenar por"
            >
              {Object.entries(SORT_OPTIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setReloadToken((t) => t + 1)}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              title="Recarregar produtos"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? "animate-spin text-[#ee3135]" : ""}`} />
            </button>
          </div>
        </div>

        {/* Atalhos de categoria */}
        <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
          {quickCategories.map((cat) => (
            <button
              key={cat.path}
              onClick={() => selectCategory(cat.name, cat.path)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                categoryPath === cat.path && !query
                  ? "bg-[#ee3135] text-white shadow-sm"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {(shownError || warning) && (
          <div
            className={`mx-4 mt-3 p-3 rounded-xl border text-xs flex items-center gap-2 ${
              shownError ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            {shownError ? (
              <AlertCircle className="w-4 h-4 text-[#ee3135] shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{shownError || warning}</span>
          </div>
        )}

        {/* Produto importado por link */}
        {singleImportedProduct && (
          <div className="mx-4 mt-4 p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-400 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0">
                <Image
                  src={singleImportedProduct.imageUrl}
                  alt={singleImportedProduct.name}
                  fill
                  sizes="64px"
                  className="object-contain p-1"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">
                  ✓ Produto encontrado no site da Benoit
                </span>
                <h4 className="text-sm font-bold text-slate-900">{singleImportedProduct.name}</h4>
                <div className="text-xs text-slate-700 font-mono mt-0.5">
                  <span className="font-bold text-slate-900">{brl(singleImportedProduct.price)}</span> • Medidas:{" "}
                  {singleImportedProduct.dimensions.widthCm} (L) × {singleImportedProduct.dimensions.heightCm} (A) ×{" "}
                  {singleImportedProduct.dimensions.depthCm} (P) cm
                </div>
              </div>
            </div>
            <button
              onClick={() => importProduct(singleImportedProduct)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#ee3135] hover:bg-[#b12124] text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Importar para o Meu Cômodo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Lista de produtos */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 space-y-4">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-600 pb-1">
            <span className="font-bold truncate">{heading}</span>
            <span className="font-mono text-[11px] bg-white px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
              {products.length} de {total} produtos
            </span>
          </div>

          {roomMeasurements && (
            <FitFilter
              enabled={fit.enabled}
              onToggle={fit.setEnabled}
              space={fit.space}
              onSpaceChange={fit.setSpace}
              fitCount={fit.fitCount}
              totalCount={products.length}
            />
          )}

          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-3 border-[#ee3135] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-slate-600">Consultando o catálogo da Benoit…</p>
            </div>
          ) : fit.visible.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center space-y-2 text-slate-600">
              <Search className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-bold">Nenhum produto encontrado</p>
              <p className="text-xs">
                {products.length > 0
                  ? "Nenhum dos produtos carregados cabe no espaço informado. Desligue o filtro ou carregue mais."
                  : "Tente outro termo de busca ou escolha uma categoria acima."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {fit.visible.map((prod) => (
                  <ProductCard
                    key={prod.id}
                    product={prod}
                    fit={fit.fits.get(prod.id)}
                    actionLabel="Importar para o Meu Cômodo"
                    actionIcon={<Sparkles className="w-3.5 h-3.5" />}
                    onAction={() => importProduct(prod)}
                  />
                ))}
              </div>

              {page < pageCount && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="px-6 py-2.5 rounded-xl bg-white border-2 border-slate-300 hover:border-[#ee3135] text-slate-800 font-bold text-xs transition cursor-pointer disabled:opacity-60"
                  >
                    {isLoadingMore ? "Carregando…" : `Carregar mais (${total - products.length} restantes)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${warning ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
            <span>{warning ? "Catálogo de demonstração (site indisponível)" : "Conectado ao catálogo oficial da Benoit."}</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Clique em &quot;Importar para o Meu Cômodo&quot; para testar se cabe no seu espaço.
          </div>
        </div>
      </div>
    </div>
  );
}
