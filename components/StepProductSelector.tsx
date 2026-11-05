"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ShoppingBag,
  Search,
  Link as LinkIcon,
  Ruler,
  Check,
  ExternalLink,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Info,
  Layers,
  AlertCircle,
  Globe,
} from "lucide-react";
import { BENOIT_CATALOG, BenoitProduct } from "@/data/benoit-catalog";
import type { RoomMeasurements, StyleProfile } from "@/lib/scene-types";
import { ProductCard } from "@/components/product/ProductCard";
import { FitFilter } from "@/components/product/FitFilter";
import { useFitFilter } from "@/components/product/useFitFilter";

const PAGE_SIZE = 24;

interface Listing {
  key: string;
  products: BenoitProduct[];
  total: number;
  page: number;
  pageCount: number;
  warning: string;
  error: string;
  /** Busca efetivamente usada (pode ser mais ampla que a pedida) */
  q?: string;
  cat?: string;
}
const EMPTY_LISTING: Listing = { key: "", products: [], total: 0, page: 1, pageCount: 1, warning: "", error: "" };

interface StepProductSelectorProps {
  selectedProduct: BenoitProduct | null;
  onSelectProduct: (product: BenoitProduct) => void;
  onBack: () => void;
  onNext: () => void;
  onOpenInAppBrowser?: () => void;
  /** Espaço disponível: habilita o filtro "Cabe no meu espaço" e os selos de encaixe */
  roomMeasurements?: RoomMeasurements;
  /** Estilo detectado na foto: habilita as sugestões "Combina com o seu ambiente" */
  styleProfile?: StyleProfile;
  /** Busca inicial (ex.: fluxo "Substituir"); quando muda, a lista busca isso */
  initialQuery?: string;
  /** Categoria inicial; vazio/indefinido com initialQuery busca em todo o site */
  initialCategoryPath?: string;
  /** Faixa exibida no topo (ex.: "Substituindo: Mesa de jantar") */
  contextBanner?: React.ReactNode;
}

export function StepProductSelector({
  selectedProduct,
  onSelectProduct,
  onBack,
  onNext,
  onOpenInAppBrowser,
  roomMeasurements,
  styleProfile,
  initialQuery,
  initialCategoryPath,
  contextBanner,
}: StepProductSelectorProps) {
  const [searchTerm, setSearchTerm] = useState(initialQuery ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState((initialQuery ?? "").trim());
  const [activeCategory, setActiveCategory] = useState<string>(
    initialQuery || initialCategoryPath ? (initialCategoryPath ?? "") : "/moveis-e-decoracao/sala-de-estar/sofa"
  );
  const [listing, setListing] = useState<Listing>(EMPTY_LISTING);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  // Busca inicial vinda de fora: deriva o estado durante a renderização quando as props mudam
  const initialKey = initialQuery || initialCategoryPath ? `${initialQuery ?? ""}|${initialCategoryPath ?? ""}` : "";
  const [appliedInitialKey, setAppliedInitialKey] = useState(initialKey);
  if (initialKey !== appliedInitialKey) {
    setAppliedInitialKey(initialKey);
    if (initialKey) {
      setSearchTerm(initialQuery ?? "");
      setDebouncedQuery((initialQuery ?? "").trim());
      setActiveCategory(initialCategoryPath ?? "");
    }
  }
  const [urlInput, setUrlInput] = useState("");
  const [isExtractingUrl, setIsExtractingUrl] = useState(false);
  const [extractSuccessProduct, setExtractSuccessProduct] = useState<BenoitProduct | null>(null);
  const [extractErrorMsg, setExtractErrorMsg] = useState("");
  const [customImportedList, setCustomImportedList] = useState<BenoitProduct[]>([]);
  const [previewProductModal, setPreviewProductModal] = useState<BenoitProduct | null>(null);

  const categories = [
    { id: "", label: "Todas" },
    { id: "/moveis-e-decoracao/sala-de-estar/sofa", label: "Sofás" },
    { id: "/moveis-e-decoracao/sala-de-estar/poltrona", label: "Poltronas" },
    { id: "/moveis-e-decoracao/sala-de-estar/racks-e-paineis", label: "Racks e Painéis" },
    { id: "/moveis-e-decoracao/sala-de-estar/mesa-de-centro", label: "Mesas de centro" },
    { id: "/moveis-e-decoracao/quarto/guarda-roupa", label: "Guarda-roupas" },
    { id: "/moveis-e-decoracao/quarto/cama", label: "Camas" },
    { id: "/moveis-e-decoracao/cozinha/mesas-e-cadeiras", label: "Mesas e Cadeiras" },
    { id: "/eletro/eletrodomesticos/refrigerador", label: "Geladeiras" },
    { id: "/eletro/eletrodomesticos/fogao", label: "Fogões" },
    { id: "/tecnologia/som-e-imagem/tv", label: "TVs" },
  ];

  // Verified live links from benoit.com.br for instant testing
  const quickTestLinks = [
    {
      title: "🛋️ Estofado Movezen 1 Lugar",
      url: "https://www.benoit.com.br/estofado-movezen-nogueira-1-lugar-83-x-67-x-88cm-nogueira-marrom-111057-3221/p",
    },
    {
      title: "❄️ Geladeira Consul 455L Frost Free",
      url: "https://www.benoit.com.br/geladeira-consul-crm53mk-455l-2-portas-frost-free-111628-1990/p",
    },
    {
      title: "🚪 Categoria Roupeiros Benoit",
      url: "https://www.benoit.com.br/moveis-e-decoracao/quarto/guarda-roupa",
    },
    {
      title: "📺 Categoria Smart TVs",
      url: "https://www.benoit.com.br/tecnologia/som-e-imagem/tv",
    },
  ];

  // Busca com atraso para não consultar a API a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchTerm.trim()), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const requestKey = JSON.stringify([debouncedQuery, activeCategory]);
  const isLoading = listing.key !== requestKey;

  const fetchPage = useCallback(
    async (targetPage: number, q = debouncedQuery, cat = activeCategory) => {
      const res = await fetch("/api/benoit/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q || undefined,
          categoryPath: cat || undefined,
          page: targetPage,
          count: PAGE_SIZE,
        }),
      });
      return res.json();
    },
    [debouncedQuery, activeCategory]
  );

  useEffect(() => {
    let cancelled = false;
    const empty = (d: { products?: unknown[]; source?: string; error?: string } | null) =>
      !d?.error && d?.source !== "curated_fallback" && (d?.products?.length ?? 0) === 0;
    fetchPage(1)
      .then(async (first) => {
        let data = first;
        let q = debouncedQuery;
        let cat = activeCategory;
        let relaxedNote = "";
        // Sem resultados com texto + categoria: tenta só a categoria, depois só o texto
        if (empty(data) && debouncedQuery && activeCategory) {
          const byCat = await fetchPage(1, "", activeCategory).catch(() => null);
          if (!empty(byCat)) {
            data = byCat;
            q = "";
          } else {
            const byText = await fetchPage(1, debouncedQuery, "").catch(() => null);
            if (!empty(byText)) {
              data = byText;
              cat = "";
            }
          }
          if (q !== debouncedQuery || cat !== activeCategory) {
            relaxedNote = `Não achamos “${debouncedQuery}” nesta categoria; mostrando resultados parecidos.`;
          }
        }
        if (cancelled) return;
        setLoadMoreError("");
        setListing({
          key: requestKey,
          q,
          cat,
          products: data?.products ?? [],
          total: data?.total ?? 0,
          page: 1,
          pageCount: data?.pageCount ?? 1,
          warning:
            data?.source === "curated_fallback"
              ? (data?.warning ?? "Mostrando o catálogo de demonstração.")
              : (data?.warning ?? relaxedNote),
          error: data?.error ?? "",
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Reserva: catálogo de demonstração local, filtrado pela busca
        const q = debouncedQuery.toLowerCase();
        const items = BENOIT_CATALOG.filter(
          (p) => !q || `${p.name} ${p.brand} ${p.categoryLabel} ${p.sku}`.toLowerCase().includes(q)
        );
        setListing({
          key: requestKey,
          products: items,
          total: items.length,
          page: 1,
          pageCount: 1,
          warning: "Sem conexão com o site da Benoit. Mostrando o catálogo de demonstração.",
          error: "",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, requestKey, debouncedQuery, activeCategory]);

  const loadMore = async () => {
    if (isLoadingMore || listing.page >= listing.pageCount) return;
    const key = listing.key;
    setIsLoadingMore(true);
    setLoadMoreError("");
    try {
      const data = await fetchPage(listing.page + 1, listing.q ?? debouncedQuery, listing.cat ?? activeCategory);
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
      setLoadMoreError("Não foi possível carregar mais produtos.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Produtos importados por link aparecem primeiro (quando não há busca de texto)
  const allProducts = useMemo(() => {
    const imported = debouncedQuery ? [] : customImportedList.filter((p) => !listing.products.some((x) => x.id === p.id));
    return [...imported, ...listing.products];
  }, [customImportedList, listing.products, debouncedQuery]);

  const fit = useFitFilter(allProducts, roomMeasurements);

  // Com o filtro ligado e poucos itens que cabem, busca mais páginas sozinho (até 4 páginas)
  const needMore =
    fit.enabled && fit.hasSpace && !isLoading && !isLoadingMore && !loadMoreError && fit.fitCount < 8 &&
    listing.page < Math.min(listing.pageCount, 4);
  useEffect(() => {
    if (!needMore) return;
    const t = setTimeout(() => void loadMore(), 0);
    return () => clearTimeout(t);
    // loadMore muda a cada render; needMore e a página bastam para reavaliar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needMore, listing.page]);

  const applySuggestion = (sg: { query: string; categoryPath?: string }) => {
    setSearchTerm(sg.query);
    setDebouncedQuery(sg.query.trim());
    setActiveCategory(sg.categoryPath ?? "");
  };

  const executeExtraction = async (targetUrl: string) => {
    if (!targetUrl.trim()) return;

    setIsExtractingUrl(true);
    setExtractErrorMsg("");
    setExtractSuccessProduct(null);

    try {
      const res = await fetch("/api/benoit/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl.trim() }),
      });

      const data = await res.json();

      if (data?.isCategory && data?.products?.length > 0) {
        // User pasted or clicked a category URL
        setCustomImportedList((prev) => {
          const newItems = data.products.filter(
            (p: BenoitProduct) => !prev.some((existing) => existing.id === p.id)
          );
          return [...newItems, ...prev];
        });
        if (data.products[0]) {
          onSelectProduct(data.products[0]);
          setExtractSuccessProduct(data.products[0]);
        }
      } else if (data?.product) {
        // User pasted or clicked a single product URL
        const prod = data.product;
        setCustomImportedList((prev) => {
          const filtered = prev.filter((p) => p.id !== prod.id);
          return [prod, ...filtered];
        });
        onSelectProduct(prod);
        setExtractSuccessProduct(prod);
      } else {
        setExtractErrorMsg(
          "Não conseguimos ler os dados desta página da Benoit. Certifique-se de usar um link de produto (terminado em /p) ou abra o Navegador In-App para selecionar direto das categorias."
        );
      }
    } catch (err) {
      setExtractErrorMsg("Erro de conexão ao consultar o site da Benoit.");
    } finally {
      setIsExtractingUrl(false);
    }
  };

  const handleExtractFromUrl = (e: React.FormEvent) => {
    e.preventDefault();
    executeExtraction(urlInput);
  };

  return (
    <div className="space-y-6">
      {contextBanner}
      {/* Header Banner in clean white & Benoit Red */}
      <div className="bg-white border border-slate-200 border-l-4 border-l-[#ee3135] rounded-2xl p-5 sm:p-6 text-slate-800 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#ee3135]/10 text-[#ee3135] border border-[#ee3135]/20 mb-2">
              <ShoppingBag className="w-3.5 h-3.5" />
              Passo 2 de 3: Catálogo Oficial Lojas Benoit
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              Escolha o item no catálogo ou insira o link da Benoit
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl mt-1 leading-relaxed">
              Importamos automaticamente a foto em alta definição e as medidas oficiais
              (largura, altura e profundidade) cadastradas no site oficial <strong className="text-slate-800">benoit.com.br</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Cômodo
            </button>
            {onOpenInAppBrowser && (
              <button
                onClick={onOpenInAppBrowser}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ee3135] hover:bg-[#b12124] text-white font-bold text-xs sm:text-sm shadow-md shadow-red-500/20 transition-all hover:scale-[1.01] cursor-pointer"
              >
                <Globe className="w-4 h-4" />
                Navegador Benoit In-App
              </button>
            )}
          </div>
        </div>
      </div>

      {/* URL Link Import Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800">
            <LinkIcon className="w-4 h-4 text-[#ee3135]" />
            <span>Importação Direta por Link ou URL do site benoit.com.br:</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Suporta qualquer link de produto ou categoria
          </span>
        </div>

        <form onSubmit={handleExtractFromUrl} className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Cole o link do produto em benoit.com.br"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ee3135] focus:bg-white transition"
            />
          </div>
          <button
            type="submit"
            disabled={isExtractingUrl || !urlInput.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#ee3135] hover:bg-[#b12124] disabled:opacity-50 text-white font-bold text-xs whitespace-nowrap transition shadow-sm cursor-pointer shrink-0"
          >
            {isExtractingUrl ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Buscando…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Importar</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Test Chips for Instant Testing */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500">Testar com 1 clique:</span>
          {quickTestLinks.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setUrlInput(item.url);
                executeExtraction(item.url);
              }}
              disabled={isExtractingUrl}
              className="text-[11px] font-semibold bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-[#ee3135] border border-slate-200 hover:border-red-300 px-2.5 py-1 rounded-lg transition cursor-pointer"
            >
              {item.title}
            </button>
          ))}
        </div>

        {/* Extraction Error Notice */}
        {extractErrorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#ee3135] shrink-0" />
            <span>{extractErrorMsg}</span>
          </div>
        )}

        {/* Extraction Success Card */}
        {extractSuccessProduct && (
          <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-400 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0">
                <Image
                  src={extractSuccessProduct.imageUrl}
                  alt={extractSuccessProduct.name}
                  fill
                  className="object-contain p-1"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-[#19a565]" />
                  Produto importado com sucesso da Benoit!
                </span>
                <h4 className="text-sm font-bold text-slate-900">{extractSuccessProduct.name}</h4>
                <div className="text-xs text-slate-700 font-mono mt-0.5">
                  <strong className="text-slate-900">R$ {extractSuccessProduct.price.toFixed(2)}</strong> • Medidas: {extractSuccessProduct.dimensions.widthCm}cm (L) × {extractSuccessProduct.dimensions.heightCm}cm (A) × {extractSuccessProduct.dimensions.depthCm}cm (P)
                </div>
              </div>
            </div>

            <button
              onClick={onNext}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#ee3135] hover:bg-[#b12124] text-white font-bold text-xs shadow-md shadow-red-500/20 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <span>Avançar para Medições (Passo 3)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none min-w-0">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#ee3135] text-white shadow-sm"
                    : "bg-white text-slate-700 hover:text-[#ee3135] hover:bg-slate-50 border border-slate-200"
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por sofá, fogão, TV, roupeiro..."
            className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ee3135]"
          />
        </div>
      </div>

      {/* Sugestões pela foto */}
      {styleProfile && styleProfile.suggestions.length > 0 && (
        <div className="bg-white border border-slate-200 border-l-4 border-l-[#19a565] rounded-2xl p-3 sm:p-4 space-y-2 min-w-0">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800">
            <Sparkles className="w-4 h-4 text-[#19a565] shrink-0" />
            <span>Combina com o seu ambiente (estilo {styleProfile.style})</span>
          </div>
          {styleProfile.dominantColors.length > 0 && (
            <p className="text-[11px] text-slate-500">Cores dominantes: {styleProfile.dominantColors.join(", ")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {styleProfile.suggestions.map((sg, i) => (
              <button
                key={`${sg.label}-${i}`}
                type="button"
                onClick={() => applySuggestion(sg)}
                className="text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1.5 rounded-lg transition cursor-pointer text-left"
              >
                {sg.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {roomMeasurements && (
        <FitFilter
          enabled={fit.enabled}
          onToggle={fit.setEnabled}
          space={fit.space}
          onSpaceChange={fit.setSpace}
          fitCount={fit.fitCount}
          totalCount={allProducts.length}
        />
      )}

      {(listing.warning || listing.error || loadMoreError) && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            listing.error || loadMoreError ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{listing.error || loadMoreError || listing.warning}</span>
        </div>
      )}

      <div className="text-[11px] text-slate-500 font-mono">
        {isLoading ? "Consultando a Benoit…" : `${listing.products.length} de ${listing.total} produtos`}
      </div>

      {/* Product Grid */}
      {isLoading && allProducts.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-[3px] border-[#ee3135] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-600">Consultando o catálogo da Benoit…</p>
        </div>
      ) : fit.visible.length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center text-center space-y-2 text-slate-600">
          <Search className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-bold">Nenhum produto encontrado</p>
          <p className="text-xs">
            {allProducts.length > 0
              ? "Nenhum produto carregado cabe no espaço informado. Desligue o filtro ou carregue mais."
              : "Tente outro termo de busca ou categoria."}
          </p>
        </div>
      ) : (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 transition-opacity ${isLoading ? "opacity-50" : ""}`}>
          {fit.visible.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              fit={fit.fits.get(product.id)}
              selected={selectedProduct?.id === product.id}
              actionLabel="Simular este"
              onAction={() => onSelectProduct(product)}
              onInfo={() => setPreviewProductModal(product)}
            />
          ))}
        </div>
      )}

      {!isLoading && listing.page < listing.pageCount && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="px-6 py-2.5 rounded-xl bg-white border-2 border-slate-300 hover:border-[#ee3135] text-slate-800 font-bold text-xs transition cursor-pointer disabled:opacity-60"
          >
            {isLoadingMore ? "Carregando…" : `Carregar mais (${listing.total - listing.products.length} restantes)`}
          </button>
        </div>
      )}

      {/* Bottom Sticky Bar if Product is Selected */}
      {selectedProduct && (
        <div className="sticky bottom-3 z-30 bg-white/95 backdrop-blur-md border border-[#ee3135] rounded-2xl p-2.5 sm:p-3 shadow-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-white border border-slate-200 shrink-0">
              <Image
                src={selectedProduct.imageUrl}
                alt={selectedProduct.name}
                fill
                className="object-contain p-1"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0">
              <div className="hidden sm:flex text-xs text-[#ee3135] font-bold items-center gap-1">
                <Check className="w-3.5 h-3.5 text-[#19a565]" />
                Produto selecionado
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate max-w-md">
                {selectedProduct.name}
              </h4>
              <div className="text-[11px] sm:text-xs text-slate-600 font-mono truncate">
                {selectedProduct.dimensions.widthCm}cm (L) × {selectedProduct.dimensions.heightCm}cm (A) × {selectedProduct.dimensions.depthCm}cm (P)
              </div>
            </div>
          </div>

          <button
            onClick={onNext}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-[#ee3135] hover:bg-[#b12124] text-white font-bold text-xs sm:text-sm whitespace-nowrap shadow-md shadow-red-500/20 transition-colors cursor-pointer"
          >
            <span>Continuar</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Technical Specs Modal */}
      {previewProductModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 sm:p-6 text-slate-800 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setPreviewProductModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-lg font-bold p-1 cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-white border border-slate-200 shrink-0">
                <Image
                  src={previewProductModal.imageUrl}
                  alt={previewProductModal.name}
                  fill
                  className="object-contain p-1"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <span className="text-[10px] text-[#ee3135] font-bold font-mono">{previewProductModal.sku}</span>
                <h3 className="text-sm font-bold text-slate-900">{previewProductModal.name}</h3>
                <span className="text-xs text-slate-500">{previewProductModal.brand}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4">{previewProductModal.description}</p>

            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5 text-[#ee3135]" />
              Dimensões e Espaço Necessário
            </h4>
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl text-center text-xs font-mono mb-4 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px]">LARGURA</span>
                <span className="text-slate-900 font-bold">{previewProductModal.dimensions.widthCm} cm</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ALTURA</span>
                <span className="text-slate-900 font-bold">{previewProductModal.dimensions.heightCm} cm</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">PROFUNDIDADE</span>
                <span className="text-slate-900 font-bold">{previewProductModal.dimensions.depthCm} cm</span>
              </div>
            </div>

            {previewProductModal.clearanceRequirements?.warningNote && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs mb-4 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#ee3135]" />
                <span>{previewProductModal.clearanceRequirements.warningNote}</span>
              </div>
            )}

            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#ee3135]" />
              Especificações Técnicas
            </h4>
            <div className="space-y-1.5 text-xs text-slate-700 mb-6">
              {previewProductModal.specs.map((sp, idx) => (
                <div key={idx} className="flex justify-between py-1 border-b border-slate-100 text-[11px]">
                  <span className="text-slate-500">{sp.label}</span>
                  <span className="font-semibold text-slate-900">{sp.value}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  onSelectProduct(previewProductModal);
                  setPreviewProductModal(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#ee3135] hover:bg-[#b12124] text-white font-bold text-xs transition cursor-pointer shadow-sm"
              >
                Selecionar este Produto
              </button>
              <a
                href={previewProductModal.productUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition flex items-center gap-1 border border-slate-300"
              >
                <span>Ver na Benoit</span>
                <ExternalLink className="w-3 h-3 text-[#ee3135]" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
