import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Ruler, ShoppingCart, Sparkles } from "lucide-react";
import { formatShareCode, getShare } from "@/lib/share-store";
import { buildCartUrl, toCartLines } from "@/lib/cart";
import type { BenoitProduct } from "@/data/benoit-catalog";

type Props = { params: Promise<{ id: string }> };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) return { title: "Simulação não encontrada | Benoit Casa Viva", robots: { index: false } };
  const base = await origin();
  const total = share.products.reduce((s, p) => s + p.price, 0);
  const title = "Minha simulação | Benoit Casa Viva";
  const ai = share.aiGenerated ? " Imagem ilustrativa gerada por IA — confira os produtos oficiais." : "";
  const description = `${share.products.length} ${share.products.length === 1 ? "produto" : "produtos"} das Lojas Benoit no meu ambiente, total ${brl(total)}. Veja como ficou!${ai}`;
  const image = share.thumb ? `${base}/api/share/${share.id}/image?thumb=1` : `${base}/api/share/${share.id}/image`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", url: `${base}/simulacao/${share.id}`, images: [share.thumb ? { url: image, width: share.thumb.width, height: share.thumb.height } : { url: image }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SimulacaoPage({ params }: Props) {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) notFound();

  const total = share.products.reduce((s, p) => s + p.price, 0);
  const lines = toCartLines(share.products as unknown as BenoitProduct[]);
  const cartUrl = lines.length ? buildCartUrl(lines) : null;
  const expires = new Date(share.expiresAt).toLocaleDateString("pt-BR");
  const m = share.measurements;

  return (
    <main className="min-h-screen bg-slate-50 pb-28 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <span className="font-extrabold text-[#ee3135] text-lg">Benoit Casa Viva</span>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 leading-none">Código da simulação</p>
            <p className="font-mono font-bold text-lg tracking-widest leading-tight">{formatShareCode(share.id)}</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/share/${share.id}/image`}
          alt="Simulação do ambiente com os produtos da Benoit"
          className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
        />
        {share.aiGenerated && (
          <p role="note" className="-mt-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Imagem ilustrativa gerada por IA — confira os produtos oficiais abaixo
          </p>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-4 pt-4 pb-2 font-bold text-lg">
            Produtos da simulação <span className="text-slate-400 font-normal">({share.products.length})</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {share.products.map((p, i) => (
              <li key={`${p.id}-${i}`}>
                <a
                  href={p.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 px-4 py-3 hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-[#ee3135] focus-visible:ring-inset"
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      loading="lazy"
                      className="w-20 h-20 object-contain rounded-lg bg-white border border-slate-100 shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-lg bg-slate-100 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500 truncate">{p.brand}</p>
                    <p className="text-sm font-semibold leading-snug line-clamp-2">{p.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {p.dimensions.widthCm} × {p.dimensions.heightCm} × {p.dimensions.depthCm} cm (L × A × P)
                    </p>
                    <p className="font-bold text-[#19a565]">{brl(p.price)}</p>
                    {p.installment && <p className="text-xs text-slate-600">{p.installment}</p>}
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 shrink-0 mt-1" aria-label="Abrir na Benoit" />
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-extrabold text-[#19a565]">{brl(total)}</span>
          </div>
        </section>

        {m && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="font-bold flex items-center gap-2 mb-2">
              <Ruler className="w-4 h-4 text-[#ee3135]" aria-hidden /> Medidas do cômodo
            </h2>
            <p className="text-sm text-slate-700">
              Largura {m.widthCm} cm · Altura {m.heightCm} cm · Profundidade {m.depthCm} cm
            </p>
          </section>
        )}

        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-[#ee3135] text-[#ee3135] font-semibold hover:bg-red-50"
        >
          <Sparkles className="w-4 h-4" aria-hidden /> Fazer minha própria simulação
        </Link>
        <p className="text-center text-xs text-slate-500">
          Preços e disponibilidade sujeitos a alteração no site. Esta simulação fica disponível até {expires}.
        </p>
      </div>

      {cartUrl && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3">
          <a
            href={cartUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="max-w-3xl mx-auto flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#19a565] hover:bg-[#148c55] text-white font-bold text-base shadow-md"
          >
            <ShoppingCart className="w-5 h-5" aria-hidden /> Comprar tudo na Benoit
          </a>
        </div>
      )}
    </main>
  );
}
