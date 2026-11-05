/**
 * Link de "adicionar ao carrinho" do checkout VTEX da Benoit.
 * Formato: /checkout/cart/add?sku=<id>&qty=<n>&seller=<id>&sc=1 (parâmetros repetidos por item).
 */
import type { BenoitProduct } from "@/data/benoit-catalog";

export const BENOIT_STORE_URL = "https://www.benoit.com.br";

export interface CartLine {
  sku: string;
  sellerId?: string;
  quantity: number;
}

/** Só produtos importados do site têm SKU real da VTEX (o catálogo de demonstração não). */
export function isPurchasable(p: BenoitProduct): boolean {
  return /^\d+$/.test(p.sku);
}

/** Agrupa produtos repetidos em linhas de carrinho. */
export function toCartLines(products: BenoitProduct[]): CartLine[] {
  const lines = new Map<string, CartLine>();
  for (const p of products.filter(isPurchasable)) {
    const line = lines.get(p.sku);
    if (line) line.quantity += 1;
    else lines.set(p.sku, { sku: p.sku, sellerId: p.sellerId ?? "1", quantity: 1 });
  }
  return [...lines.values()];
}

export function buildCartUrl(lines: CartLine[]): string {
  const params = new URLSearchParams();
  for (const l of lines) {
    params.append("sku", l.sku);
    params.append("qty", String(Math.max(1, Math.floor(l.quantity))));
    params.append("seller", l.sellerId ?? "1");
  }
  params.append("sc", "1");
  return `${BENOIT_STORE_URL}/checkout/cart/add?${params}`;
}
