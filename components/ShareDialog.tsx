"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Copy, Download, Loader2, Share2, Store, X } from "lucide-react";
import type { BenoitProduct } from "@/data/benoit-catalog";
import type { RoomMeasurements } from "@/lib/scene-types";
import { StoreHandoff } from "@/components/share/StoreHandoff";
import { makeThumbnail, prepareImageForUpload } from "@/components/share/image";

export interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Gera a imagem final da simulação (PNG/JPEG). Fornecido pelo editor de cena. */
  getImageBlob: () => Promise<Blob | null>;
  products: BenoitProduct[];
  measurements?: RoomMeasurements;
  /** true quando a imagem é a foto realista gerada por IA (aviso de "ilustrativa" na página e na mensagem). */
  aiGenerated?: boolean;
}

interface Shared {
  id: string;
  url: string;
  /** Assinatura da simulação (produtos + medidas) a que o link se refere. */
  key: string;
}

const formatCode = (id: string) => (id.match(/.{1,4}/g) ?? [id]).join("-").toUpperCase();

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.5A9.9 9.9 0 1 0 12.04 2Zm5.8 14.1c-.25.7-1.45 1.35-2 1.4-.5.05-1.15.07-1.85-.12a12 12 0 0 1-1.7-.63c-3-1.3-4.95-4.3-5.1-4.5-.15-.2-1.2-1.6-1.2-3.05s.75-2.15 1.02-2.45c.27-.3.6-.37.8-.37h.57c.18 0 .43-.07.67.5.25.6.85 2.07.92 2.22.08.15.12.32.02.5-.1.2-.15.32-.3.5-.15.17-.32.38-.45.5-.15.15-.3.3-.13.6.17.3.77 1.27 1.65 2.05 1.13 1 2.08 1.3 2.38 1.45.3.15.47.12.65-.07.17-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.72.82 2.02.97.3.15.5.22.57.35.07.12.07.72-.18 1.42Z" />
    </svg>
  );
}

export function ShareDialog({ isOpen, onClose, getImageBlob, products, measurements, aiGenerated }: ShareDialogProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [sharedState, setShared] = useState<Shared | null>(null);
  const [busy, setBusy] = useState<null | "whatsapp" | "native" | "copy" | "store">(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"main" | "store">("main");

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<{ key: string; p: Promise<Shared> } | null>(null);
  const getImageBlobRef = useRef(getImageBlob);
  useEffect(() => {
    getImageBlobRef.current = getImageBlob;
  });

  // Gera a imagem ao abrir; limpa tudo ao fechar.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let url: string | null = null;
    getImageBlobRef
      .current()
      .then((b) => {
        if (cancelled) return;
        if (!b) {
          setImageError("Não foi possível gerar a imagem da simulação.");
          return;
        }
        url = URL.createObjectURL(b);
        setBlob(b);
        setPreviewUrl(url);
      })
      .catch(() => !cancelled && setImageError("Não foi possível gerar a imagem da simulação."));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setBlob(null);
      setPreviewUrl(null);
      setImageError(null);
      setError(null);
      setView("main");
      setShared(null);
      pending.current = null;
      setCopied(false);
    };
  }, [isOpen]);

  // Se a simulação mudar, o link antigo deixa de valer (a chave não confere).
  const productsKey = products.map((p) => p.id).join("|") + JSON.stringify(measurements ?? null) + String(aiGenerated === true);
  const shared = sharedState?.key === productsKey ? sharedState : null;

  const canShareFiles = useMemo(() => {
    if (!blob || typeof navigator === "undefined" || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [new File([blob], "simulacao-benoit.jpg", { type: blob.type || "image/jpeg" })] });
    } catch {
      return false;
    }
  }, [blob]);

  // Foco, Esc, trava de rolagem e retorno do foco.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab" && dialogRef.current) {
        const items = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [isOpen, onClose]);

  /** Cria o link uma única vez e reaproveita nas outras ações. */
  const ensureShared = useCallback((): Promise<Shared> => {
    if (shared) return Promise.resolve(shared);
    if (pending.current?.key === productsKey) return pending.current.p;
    if (!blob) return Promise.reject(new Error("A imagem ainda não está pronta."));
    const p = (async () => {
      const image = await prepareImageForUpload(blob);
      const thumb = await makeThumbnail(image);
      const form = new FormData();
      if (thumb) form.append("thumb", thumb, "thumb.jpg");
      form.append("image", image, image.type === "image/png" ? "simulacao.png" : "simulacao.jpg");
      form.append(
        "data",
        JSON.stringify({
          measurements,
          aiGenerated: aiGenerated === true,
          products: products.map((x) => ({
            id: x.id,
            sku: x.sku,
            sellerId: x.sellerId,
            name: x.name,
            brand: x.brand,
            price: x.price,
            installment: x.installment,
            imageUrl: x.imageUrl,
            productUrl: x.productUrl,
            dimensions: {
              widthCm: x.dimensions.widthCm,
              heightCm: x.dimensions.heightCm,
              depthCm: x.dimensions.depthCm,
            },
          })),
        }),
      );
      const res = await fetch("/api/share", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: string };
      if (!res.ok || !json.id || !json.url) throw new Error(json.error || "Não foi possível criar o link.");
      const result = { id: json.id, url: json.url, key: productsKey };
      setShared(result);
      return result;
    })();
    pending.current = { key: productsKey, p };
    p.catch(() => {
      if (pending.current?.p === p) pending.current = null;
    });
    return p;
  }, [shared, blob, products, measurements, productsKey, aiGenerated]);

  // Cria o link antecipadamente SÓ quando o Web Share com arquivo existe (iOS exige o gesto do usuário).
  useEffect(() => {
    if (isOpen && blob && canShareFiles) ensureShared().catch(() => {});
  }, [isOpen, blob, canShareFiles, ensureShared]);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Algo deu errado. Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const message = (url: string) =>
    `Olha como ficou minha simulação com os móveis das Lojas Benoit! 🛋️${aiGenerated ? " (imagem ilustrativa gerada por IA)" : ""}\nVeja os produtos, preços e compre aqui: ${url}`;

  // wa.me não anexa imagem: a foto aparece pelo preview (Open Graph) da página do link.
  const whatsapp = () =>
    run("whatsapp", async () => {
      // Abre a aba antes do await para o navegador não bloquear o pop-up.
      const win = window.open("about:blank", "_blank");
      try {
        const s = await ensureShared();
        const target = `https://wa.me/?text=${encodeURIComponent(message(s.url))}`;
        if (win) win.location.href = target;
        else window.location.href = target;
      } catch (e) {
        win?.close();
        throw e;
      }
    });

  // Sem await antes de navigator.share: o Safari iOS exige o gesto do usuário.
  const nativeShare = () =>
    run("native", async () => {
      if (!blob) return;
      const file = new File([blob], "simulacao-benoit.jpg", { type: blob.type || "image/jpeg" });
      // O link vai também no texto (o Safari às vezes ignora o campo url com arquivo).
      const text = shared
        ? message(shared.url)
        : `Olha como ficou minha simulação com os móveis das Lojas Benoit! 🛋️${aiGenerated ? " (imagem ilustrativa gerada por IA)" : ""}`;
      await navigator.share({ files: [file], text });
    });

  const copy = () =>
    run("copy", async () => {
      const s = await ensureShared();
      try {
        await navigator.clipboard.writeText(s.url);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = s.url;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        if (!ok) throw new Error("Não foi possível copiar. Copie o link manualmente: " + s.url);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });

  const store = () =>
    run("store", async () => {
      await ensureShared();
      setView("store");
    });

  const download = () => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `simulacao-benoit.${blob?.type === "image/png" ? "png" : "jpg"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (!isOpen) return null;

  const ready = !!blob && !imageError;
  const btn =
    "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#ee3135]";
  const spin = <Loader2 className="w-4 h-4 animate-spin" aria-hidden />;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="bg-white w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl"
      >
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-4 py-3 border-b border-slate-100">
          {view === "store" ? (
            <button
              type="button"
              onClick={() => setView("main")}
              className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee3135]"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden /> Voltar
            </button>
          ) : null}
          <h2 id="share-title" className={view === "store" ? "sr-only" : "font-bold text-lg text-slate-900"}>
            {view === "store" ? "Levar para a loja" : "Compartilhar simulação"}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 -mr-2 rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee3135]"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {view === "store" && shared ? (
            <StoreHandoff url={shared.url} code={formatCode(shared.id)} />
          ) : (
            <>
              <div className="aspect-[4/3] w-full rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Prévia da simulação" className="w-full h-full object-contain" />
                ) : imageError ? (
                  <p className="text-sm text-slate-500 px-6 text-center">{imageError}</p>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500 text-sm" role="status">
                    <Loader2 className="w-6 h-6 animate-spin" aria-hidden /> Gerando imagem...
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={whatsapp}
                  disabled={!ready || busy !== null}
                  className={`${btn} bg-[#25d366] hover:bg-[#1fb957] text-white`}
                >
                  {busy === "whatsapp" ? spin : <WhatsAppIcon className="w-5 h-5" />}
                  {busy === "whatsapp" ? "Criando link..." : "Enviar no WhatsApp"}
                </button>
                {canShareFiles && (
                  <button
                    type="button"
                    onClick={nativeShare}
                    disabled={!ready || busy !== null}
                    className={`${btn} bg-slate-900 hover:bg-slate-700 text-white`}
                  >
                    {busy === "native" ? spin : <Share2 className="w-4 h-4" aria-hidden />}
                    Compartilhar imagem e link
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    disabled={!ready || busy !== null}
                    className={`${btn} border border-slate-300 text-slate-800 hover:bg-slate-50`}
                  >
                    {busy === "copy" ? (
                      spin
                    ) : copied ? (
                      <Check className="w-4 h-4 text-[#19a565]" aria-hidden />
                    ) : (
                      <Copy className="w-4 h-4" aria-hidden />
                    )}
                    {copied ? "Link copiado!" : "Copiar link"}
                  </button>
                  <button
                    type="button"
                    onClick={download}
                    disabled={!ready}
                    className={`${btn} border border-slate-300 text-slate-800 hover:bg-slate-50`}
                  >
                    <Download className="w-4 h-4" aria-hidden /> Baixar imagem
                  </button>
                </div>
                <button
                  type="button"
                  onClick={store}
                  disabled={!ready || busy !== null}
                  className={`${btn} bg-[#ee3135] hover:bg-[#d9222a] text-white`}
                >
                  {busy === "store" ? spin : <Store className="w-4 h-4" aria-hidden />}
                  Levar para a loja
                </button>
                <p className="text-xs text-slate-500 text-center">
                  No WhatsApp, a foto aparece na prévia do link. O vendedor abre sua simulação no tablet por QR code.
                  O link fica ativo por 30 dias.
                </p>
              </div>
            </>
          )}

          {error && (
            <div
              role="alert"
              className="flex gap-2 items-start text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
