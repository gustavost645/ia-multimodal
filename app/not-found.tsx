import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 text-[#d9222a] flex items-center justify-center mb-4 text-2xl font-bold">
        404
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Página não encontrada</h1>
      <p className="text-slate-600 mb-6 max-w-md">
        O recurso ou página do Simulador Benoit que você tentou acessar não foi encontrado.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 bg-[#d9222a] hover:bg-[#b8181f] text-white font-medium rounded-xl transition-colors shadow-sm"
      >
        Voltar ao Simulador
      </Link>
    </div>
  );
}
