'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Router caught error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 text-[#d9222a] flex items-center justify-center mb-4 text-2xl font-bold">
        !
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Algo deu errado</h1>
      <p className="text-slate-600 mb-6 max-w-md">
        Ocorreu um erro ao carregar o simulador. Você pode tentar novamente ou voltar à página inicial.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 bg-[#d9222a] hover:bg-[#b8181f] text-white font-medium rounded-xl transition-colors shadow-sm"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium rounded-xl transition-colors"
        >
          Início
        </Link>
      </div>
    </div>
  );
}
