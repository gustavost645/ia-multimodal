"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";

export default function LojaPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const clean = code.replace(/[\s-]/g, "").toLowerCase();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9]{12}$/.test(clean)) {
      setError("O código tem 12 letras e números (ex.: 4Y9N-923N-ZHAQ).");
      return;
    }
    router.push(`/simulacao/${clean}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3 text-[#ee3135]">
          <Store className="w-7 h-7" aria-hidden />
          <h1 className="text-2xl font-extrabold">Abrir simulação do cliente</h1>
        </div>
        <p className="text-slate-600 text-sm">
          Digite o código que aparece na tela do cliente (em &ldquo;Levar para a loja&rdquo;). Também dá para escanear o QR code com a câmera do tablet.
        </p>
        <div>
          <label htmlFor="codigo" className="block text-sm font-semibold text-slate-800 mb-1">
            Código da simulação
          </label>
          <input
            id="codigo"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? "codigo-erro" : undefined}
            className="w-full rounded-xl border border-slate-300 px-4 py-4 text-2xl font-mono font-bold tracking-widest uppercase text-center focus:outline-none focus:ring-2 focus:ring-[#ee3135]"
          />
          {error && (
            <p id="codigo-erro" role="alert" className="text-sm text-red-700 mt-2">
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[#ee3135] hover:bg-[#d9222a] text-white font-bold text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#ee3135]"
        >
          Abrir simulação <ArrowRight className="w-5 h-5" aria-hidden />
        </button>
        <Link href="/" className="block text-center text-sm text-slate-500 hover:text-slate-800 underline">
          Voltar ao simulador
        </Link>
      </form>
    </main>
  );
}
