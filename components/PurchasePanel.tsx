"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, MapPin, ShoppingCart, Store, Truck } from "lucide-react";
import type { BenoitProduct } from "@/data/benoit-catalog";
import { buildCartUrl, isPurchasable, toCartLines } from "@/lib/cart";
import type { ShippingResult } from "@/lib/benoit-api";
import { DeliveryCheck } from "@/components/DeliveryCheck";

export interface PurchasePanelProps {
  /** Produtos da cena (pode haver repetidos: cada um conta 1 unidade) */
  products: BenoitProduct[];
  /** Medidas do cômodo informadas pelo usuário, para contexto */
  className?: string;
}

const CEP_KEY = "benoit-casa-viva:cep";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const maskCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

interface Group {
  product: BenoitProduct;
  quantity: number;
}

function groupProducts(products: BenoitProduct[]): Group[] {
  const map = new Map<string, Group>();
  for (const p of products) {
    const g = map.get(p.id);
    if (g) g.quantity += 1;
    else map.set(p.id, { product: p, quantity: 1 });
  }
  return [...map.values()];
}

/**
 * Painel de compra da cena: total, "Adicionar tudo ao carrinho" (checkout VTEX da Benoit),
 * frete e retirada na loja por CEP, e verificação "Passa pela porta/elevador?".
 */
export function PurchasePanel({ products, className }: PurchasePanelProps) {
  const groups = useMemo(() => groupProducts(products), [products]);
  const total = groups.reduce((s, g) => s + g.product.price * g.quantity, 0);
  const lines = useMemo(() => toCartLines(products), [products]);
  const hasDemo = groups.some((g) => !isPurchasable(g.product));
  const cartHref = lines.length ? buildCartUrl(lines) : "";

  // Parcelamento: só mostra "sem juros" se todos os itens tiverem essa condição (usa o menor nº de parcelas).
  const installment = useMemo(() => {
    const counts = groups.map((g) => g.product.installment.match(/^(\d+)x .*sem juros/)?.[1]);
    if (total <= 0 || counts.some((c) => !c)) return "";
    const n = Math.min(...counts.map(Number));
    return n > 1 ? `ou ${n}x de ${brl(total / n)} sem juros` : "";
  }, [groups, total]);

  const [cep, setCep] = useState("");
  const [shipping, setShipping] = useState<ShippingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFit, setShowFit] = useState(false);
  const reqId = useRef(0);
  const cepReady = cep.replace(/\D/g, "").length === 8;

  const linesKey = lines.map((l) => `${l.sku}:${l.sellerId}:${l.quantity}`).join(",");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CEP_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restaura valor externo (localStorage) após hidratar
      if (saved) setCep(maskCep(saved));
    } catch {
      /* sem acesso ao localStorage */
    }
  }, []);

  // Consulta automática (debounce) quando o CEP está completo ou os itens mudam
  useEffect(() => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8 || lines.length === 0) return;
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/benoit/shipping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines, postalCode: digits }),
        });
        const data = await res.json();
        if (id !== reqId.current) return;
        if (!data.success) throw new Error(data.error || "Não foi possível calcular o frete.");
        setShipping(data.shipping);
        try {
          localStorage.setItem(CEP_KEY, digits);
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (id !== reqId.current) return;
        setShipping(null);
        setError(e instanceof Error ? e.message : "Não foi possível calcular o frete.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cep, linesKey]);

  if (products.length === 0) {
    return (
      <div className={className}>
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
          Adicione produtos à cena para ver o total e calcular o frete.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Lista */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-xs font-bold text-slate-800">Produtos da sua cena</h3>
        <ul className="divide-y divide-slate-100">
          {groups.map(({ product: p, quantity }) => (
            <li key={p.id} className="flex items-center gap-2.5 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg border border-slate-100 bg-white object-contain"
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs font-semibold text-slate-800">{p.name}</p>
                <p className="text-xs text-slate-600">
                  {quantity > 1 && <span className="font-semibold">{quantity} × </span>}
                  {brl(p.price)}
                </p>
                {!isPurchasable(p) && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-amber-700">
                    Produto de demonstração
                    <a
                      href={p.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-semibold text-[#ee3135] hover:underline"
                    >
                      Ver na Benoit <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-2 border-t border-slate-100 pt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-600">Total dos produtos</span>
            <span className="text-base font-bold text-slate-900">{brl(total)}</span>
          </div>
          {installment && <p className="text-right text-[11px] text-[#19a565]">{installment}</p>}
        </div>

        {cartHref ? (
          <a
            href={cartHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ee3135] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#d62a2e]"
          >
            <ShoppingCart className="h-4 w-4" />
            Adicionar tudo ao carrinho
          </a>
        ) : (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Nenhum produto da cena pode ser comprado direto (itens de demonstração).
          </p>
        )}
        {cartHref && hasDemo && (
          <p className="mt-1.5 text-[10px] text-slate-500">
            Os produtos de demonstração não entram no carrinho.
          </p>
        )}
      </div>

      {/* Frete e retirada */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <Truck className="h-4 w-4 text-[#ee3135]" /> Frete e retirada
        </h3>
        {lines.length === 0 ? (
          <p className="text-[11px] text-slate-500">Disponível para produtos vendidos no site da Benoit.</p>
        ) : (
          <>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-1.5 focus-within:border-[#ee3135]">
              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="Digite seu CEP"
                value={cep}
                onChange={(e) => setCep(maskCep(e.target.value))}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
              {cepReady && loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </label>

            {cepReady && error && <p className="mt-2 text-[11px] text-[#ee3135]">{error}</p>}

            {cepReady && shipping && !loading && (
              <div className="mt-2 space-y-2">
                {shipping.delivery ? (
                  <div className="flex items-start gap-2 rounded-xl border border-slate-200 p-2.5">
                    <Truck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-semibold text-slate-800">{shipping.delivery.name}</p>
                      <p className="text-slate-500">{shipping.delivery.estimateLabel}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-900">
                      {shipping.delivery.price > 0 ? brl(shipping.delivery.price) : "Grátis"}
                    </span>
                  </div>
                ) : (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    {shipping.messages[0] ?? "Algum item não é entregue neste CEP."}
                  </p>
                )}

                {shipping.pickups.map((s) => (
                  <div key={s.name} className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-2.5">
                    <Store className="mt-0.5 h-4 w-4 shrink-0 text-[#19a565]" />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-semibold text-slate-800">Retire na loja: {s.friendlyName}</p>
                      {s.address && <p className="text-[11px] text-slate-500">{s.address}</p>}
                      <p className="text-slate-500">{s.estimateLabel}</p>
                    </div>
                    <span className="text-xs font-bold text-[#19a565]">{s.price > 0 ? brl(s.price) : "Grátis"}</span>
                  </div>
                ))}
                {shipping.pickups.length === 0 && (
                  <p className="text-[11px] text-slate-500">Nenhuma loja com todos os itens para retirada neste CEP.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Passa pela porta? */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowFit((v) => !v)}
          aria-expanded={showFit}
          className="flex w-full items-center justify-between gap-2 p-3 text-left text-xs font-bold text-slate-800"
        >
          Passa pela porta?
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showFit ? "rotate-180" : ""}`} />
        </button>
        {showFit && (
          <div className="border-t border-slate-100 p-3">
            <DeliveryCheck products={groups.map((g) => g.product)} />
          </div>
        )}
      </div>
    </div>
  );
}
