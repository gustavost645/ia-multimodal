"use client";

import React from "react";
import { Maximize, Smartphone, Sun, DoorOpen, User, Square } from "lucide-react";

const TIPS = [
  { icon: Maximize, text: "Fotografe a parede inteira onde o móvel vai ficar." },
  { icon: User, text: "Mantenha o celular na altura do peito." },
  { icon: Smartphone, text: "Deixe o celular na horizontal.", rotate: true },
  { icon: Sun, text: "Acenda as luzes e evite contraluz." },
  { icon: Square, text: "Mostre o piso até a base da parede." },
  { icon: DoorOpen, text: "Inclua uma porta, se possível: ela serve de referência de medida." },
];

function GuideIllustration() {
  return (
    <svg viewBox="0 0 160 100" className="w-full max-w-[200px] mx-auto" role="img" aria-label="Exemplo de enquadramento">
      <rect x="2" y="2" width="156" height="96" rx="8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5 4" />
      <rect x="12" y="10" width="136" height="60" fill="#e2e8f0" />
      <polygon points="12,70 148,70 158,96 2,96" fill="#cbd5e1" />
      <rect x="112" y="24" width="26" height="46" rx="2" fill="#fff" stroke="#94a3b8" strokeWidth="1.5" />
      <circle cx="133" cy="48" r="1.8" fill="#94a3b8" />
      <rect x="28" y="42" width="62" height="28" rx="4" fill="#ee3135" opacity="0.85" />
      <text x="59" y="60" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">
        móvel
      </text>
      <text x="125" y="19" textAnchor="middle" fontSize="7" fontWeight="700" fill="#475569">
        porta
      </text>
    </svg>
  );
}

export function PhotoGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      {!compact && <GuideIllustration />}
      <ul className="space-y-1.5">
        {TIPS.map(({ icon: Icon, text, rotate }) => (
          <li key={text} className="flex items-start gap-2 text-[11px] text-slate-700 leading-snug">
            <span className="w-6 h-6 rounded-lg bg-[#ee3135]/10 text-[#ee3135] flex items-center justify-center shrink-0">
              <Icon className={`w-3.5 h-3.5 ${rotate ? "rotate-90" : ""}`} />
            </span>
            <span className="pt-1">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
