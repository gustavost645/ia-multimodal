"use client";

import React from "react";
import Image from "next/image";
import { Sparkles, Home, ShoppingBag, Ruler, RotateCcw, Store } from "lucide-react";

interface HeaderProps {
  currentStep: 1 | 2 | 3;
  onSelectStep: (step: 1 | 2 | 3) => void;
  onReset: () => void;
  hasRoom: boolean;
  hasProduct: boolean;
}

export function Header({
  currentStep,
  onSelectStep,
  onReset,
  hasRoom,
  hasProduct,
}: HeaderProps) {
  const steps = [
    {
      num: 1 as const,
      label: "1. Foto do Cômodo",
      sublabel: "Câmera ou Upload",
      icon: Home,
      ready: hasRoom,
    },
    {
      num: 2 as const,
      label: "2. Produto Benoit",
      sublabel: "Catálogo & Link",
      icon: ShoppingBag,
      ready: hasProduct,
    },
    {
      num: 3 as const,
      label: "3. Medidas & Simulação",
      sublabel: "IA Multimodal",
      icon: Ruler,
      ready: hasRoom && hasProduct,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      {/* Top Benoit Announcement Bar (like benoit.com.br) */}
      <div className="bg-[#b12124] text-white text-[11px] py-1 px-4 text-center font-medium">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline">Lojas Benoit • Mais de 290 lojas físicas no Sul do Brasil</span>
            <span className="sm:hidden font-bold">Lojas Benoit Oficial</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] sm:text-[11px]">
            <span>🚚 Entrega Segura</span>
            <span className="hidden md:inline">💳 Carnê Digital & Até 10x sem juros</span>
            <span className="font-bold text-amber-200">Simulador Casa Viva</span>
          </div>
        </div>
      </div>

      {/* Main Header Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 sm:h-20">
          {/* Official Benoit Logo */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectStep(1)}>
            <div className="relative h-10 w-36 sm:w-44 flex items-center">
              {/* Official Benoit SVG Logo from VTEX CDN */}
              <Image
                src="https://benoit.vtexassets.com/assets/vtex.file-manager-graphql/images/341ef06b-1214-4805-b873-9922159f1b8b___a5143f79d27c3fade31cbdb6ce4dcfee.svg"
                alt="Lojas Benoit"
                fill
                className="object-contain object-left"
                priority
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="border-l border-slate-300 pl-3 py-1 hidden sm:block">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm tracking-tight text-slate-800">
                  CASA VIVA
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#ee3135]/10 text-[#ee3135] border border-[#ee3135]/20">
                  <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                  Simulador IA
                </span>
              </div>
              <p className="text-[10px] text-slate-500">
                Visualize móveis e eletros na sua casa
              </p>
            </div>
          </div>

          {/* Stepper Navigation in Benoit Red & Clean Gray */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
            {steps.map((st, idx) => {
              const Icon = st.icon;
              const isActive = currentStep === st.num;
              const canClick = st.num === 1 || (st.num === 2 && hasRoom) || (st.num === 3 && hasRoom && hasProduct);

              return (
                <div key={st.num} className="flex items-center">
                  <button
                    onClick={() => canClick && onSelectStep(st.num)}
                    disabled={!canClick}
                    className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#ee3135] text-white shadow-sm ring-2 ring-[#ee3135]/30"
                        : canClick
                        ? "text-slate-700 hover:text-[#ee3135] hover:bg-slate-50 border border-transparent hover:border-slate-200"
                        : "text-slate-400 cursor-not-allowed opacity-50"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isActive
                          ? "bg-white text-[#ee3135]"
                          : st.ready
                          ? "bg-[#19a565] text-white"
                          : "bg-slate-100 text-slate-500 border border-slate-300"
                      }`}
                    >
                      {st.ready && !isActive ? "✓" : st.num}
                    </div>
                    <div className="text-left">
                      <div className="leading-tight">{st.label}</div>
                      <div className="text-[10px] font-normal opacity-80">{st.sublabel}</div>
                    </div>
                  </button>
                  {idx < steps.length - 1 && (
                    <div className="w-4 h-0.5 bg-slate-200 mx-1" />
                  )}
                </div>
              );
            })}
          </nav>

          {/* Action reset */}
          <div className="flex items-center gap-2">
            {(hasRoom || hasProduct) && (
              <button
                onClick={onReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
                title="Reiniciar Simulação"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Recomeçar</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Stepper Bar */}
        <div className="md:hidden py-2.5 border-t border-slate-100 flex justify-between items-center text-xs">
          {steps.map((st) => {
            const isActive = currentStep === st.num;
            const canClick = st.num === 1 || (st.num === 2 && hasRoom) || (st.num === 3 && hasRoom && hasProduct);
            return (
              <button
                key={st.num}
                onClick={() => canClick && onSelectStep(st.num)}
                disabled={!canClick}
                className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-[#ee3135] text-white font-bold shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                  isActive ? "bg-white text-[#ee3135]" : "bg-slate-100 text-slate-600 border border-slate-300"
                }`}>
                  {st.num}
                </span>
                <span>{st.label.replace(/^\d+\.\s*/, "")}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
