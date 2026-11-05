"use client";

import React from "react";
import { Clock, Info, Sparkles, X } from "lucide-react";
import type { GenerateError } from "./useRealisticPhoto";

/** Cartão amigável para falhas da geração de foto realista. */
export function GenerateErrorCard({ error, onDismiss }: { error: GenerateError; onDismiss: () => void }) {
  if (error.reason === "cancelled") return null;

  let title = "Não foi possível gerar a foto agora";
  let text = "Algo deu errado ao gerar a imagem. Seu editor continua intacto: tente novamente em instantes.";
  let Icon = Info;
  if (error.reason === "billing") {
    title = "Este recurso precisa ser ativado pela loja";
    text =
      "A foto realista com IA ainda não está habilitada neste simulador. Enquanto isso, use o editor de cena, baixe a imagem ou compartilhe a simulação normalmente.";
    Icon = Sparkles;
  } else if (error.reason === "quota" || error.reason === "rate_limit") {
    title = "Muitos pedidos no momento";
    text = "O limite de uso da IA foi atingido. Aguarde alguns minutos e tente gerar novamente.";
    Icon = Clock;
  } else if (error.reason === "invalid") {
    title = "Não foi possível usar esta cena";
    text = "Confira os produtos e a foto do ambiente e tente novamente.";
  }

  return (
    <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-slate-800 shadow-sm">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="leading-relaxed text-slate-700">{text}</p>
          {error.message && (
            <details className="pt-1 text-[11px] text-slate-600">
              <summary className="cursor-pointer font-semibold">Detalhe técnico</summary>
              <p className="mt-1 break-words rounded bg-white/70 p-2 font-mono">{error.message}</p>
            </details>
          )}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Fechar aviso" className="cursor-pointer text-slate-500 hover:text-slate-800">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
