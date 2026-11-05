import { NextRequest, NextResponse } from "next/server";
import { RateLimitError, simulateShipping, type ShippingLineInput, type ShippingResult } from "@/lib/benoit-api";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: ShippingResult }>();

/**
 * POST /api/benoit/shipping
 * Corpo: { lines: [{ sku, sellerId?, quantity }], postalCode }  (CEP com 8 dígitos, até 20 linhas)
 * Resposta: { success, shipping: ShippingResult } ou { success: false, error }
 */
export async function POST(req: NextRequest) {
  let body: { lines?: unknown; postalCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const postalCode = String(body.postalCode ?? "").replace(/\D/g, "");
  if (postalCode.length !== 8) {
    return NextResponse.json({ success: false, error: "Informe um CEP com 8 dígitos." }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 20) {
    return NextResponse.json({ success: false, error: "Informe de 1 a 20 itens." }, { status: 400 });
  }

  const lines: ShippingLineInput[] = [];
  for (const raw of body.lines as Record<string, unknown>[]) {
    const sku = String(raw?.sku ?? "");
    const quantity = Math.floor(Number(raw?.quantity));
    const sellerId = raw?.sellerId == null ? "1" : String(raw.sellerId);
    if (!/^\d{1,12}$/.test(sku) || !/^\w{1,32}$/.test(sellerId) || !(quantity >= 1 && quantity <= 99)) {
      return NextResponse.json({ success: false, error: "Item inválido." }, { status: 400 });
    }
    lines.push({ sku, sellerId, quantity });
  }

  const key = `${postalCode}|${lines.map((l) => `${l.sku}:${l.sellerId}:${l.quantity}`).sort().join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, shipping: hit.data, cached: true });
  }

  try {
    const data = await simulateShipping(lines, postalCode);
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json({ success: true, shipping: data });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        { success: false, error: e.message, retryAfter: e.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } }
      );
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Falha ao simular o frete." },
      { status: 502 }
    );
  }
}
