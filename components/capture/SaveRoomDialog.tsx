"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bookmark, X } from "lucide-react";

interface SaveRoomDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void | Promise<void>;
  /** Nome sugerido inicialmente (opcional) */
  defaultName?: string;
}

const SUGGESTIONS = ["Sala", "Quarto do casal", "Cozinha", "Quarto", "Varanda"];

function DialogBody({ onClose, onSave, defaultName = "" }: Omit<SaveRoomDialogProps, "isOpen">) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = name.trim();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-3"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Salvar ambiente"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-base font-black text-slate-900">
              <Bookmark className="w-4 h-4 text-[#ee3135]" />
              Salvar em Meus ambientes
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Dê um nome para voltar a este cômodo depois, sem precisar fotografar de novo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label htmlFor="save-room-name" className="text-xs font-bold text-slate-800">
            Nome do ambiente
          </label>
          <input
            id="save-room-name"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Ex.: Sala, Quarto do casal"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#ee3135]/30 focus:border-[#ee3135]"
          />
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setName(s)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-sm font-semibold cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!trimmed || saving}
            className="flex-1 py-2.5 rounded-xl bg-[#ee3135] hover:bg-[#b12124] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black cursor-pointer"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function SaveRoomDialog({ isOpen, onClose, onSave, defaultName }: SaveRoomDialogProps) {
  if (!isOpen) return null;
  return <DialogBody onClose={onClose} onSave={onSave} defaultName={defaultName} />;
}
