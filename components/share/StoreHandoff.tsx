"use client";

import { useEffect, useState } from "react";
import { Loader2, Store } from "lucide-react";

/** QR code grande + código curto para o vendedor abrir a simulação no tablet. */
export function StoreHandoff({ url, code }: { url: string; code: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((m) => m.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M" }))
      .then((d) => !cancelled && setQr(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center text-center gap-3">
      <div className="flex items-center gap-2 text-[#ee3135] font-bold">
        <Store className="w-5 h-5" aria-hidden /> Levar para a loja
      </div>
      <div className="w-64 h-64 max-w-full bg-white rounded-2xl border border-slate-200 p-2 flex items-center justify-center">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR code da simulação ${code}`} className="w-full h-full" />
        ) : failed ? (
          <span className="text-sm text-slate-500 px-4">Não foi possível gerar o QR code. Use o código abaixo.</span>
        ) : (
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" aria-label="Gerando QR code" />
        )}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-500">Código da simulação</p>
        <p className="font-mono text-3xl font-extrabold tracking-widest text-slate-900">{code}</p>
      </div>
      <p className="text-sm text-slate-600 max-w-xs">
        Mostre esta tela ao vendedor: ele escaneia o QR code com o tablet (ou digita o código na página
        <span className="font-semibold"> /loja</span>) e abre a sua simulação com todos os produtos e preços.
      </p>
    </div>
  );
}
