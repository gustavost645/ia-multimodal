import Link from "next/link";
import { SearchX } from "lucide-react";

export default function SimulacaoNaoEncontrada() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 text-[#ee3135] flex items-center justify-center mb-4">
        <SearchX className="w-8 h-8" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Simulação não encontrada</h1>
      <p className="text-slate-600 mb-6 max-w-sm">
        Este link não existe ou já expirou (as simulações ficam disponíveis por 30 dias). Que tal montar uma nova?
      </p>
      <Link
        href="/"
        className="px-5 py-3 bg-[#ee3135] hover:bg-[#d9222a] text-white font-semibold rounded-xl shadow-sm"
      >
        Fazer minha simulação
      </Link>
    </main>
  );
}
