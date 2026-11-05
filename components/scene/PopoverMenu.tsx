"use client";

import React, { useEffect, useId, useRef, useState } from "react";

export interface MenuEntry {
  /** identificador estável (usado como key); padrão: o rótulo */
  id?: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  active?: boolean;
  disabled?: boolean;
  /** texto auxiliar abaixo do rótulo */
  hint?: string;
}

interface PopoverMenuProps {
  triggerLabel: string;
  triggerIcon?: React.ReactNode;
  triggerClassName?: string;
  entries: MenuEntry[];
  title?: string;
  /** alinhamento do popover no desktop */
  align?: "left" | "right";
}

/**
 * Menu acessível: popover no desktop e lista grande (bottom sheet) no celular.
 * Esc ou toque fora fecham.
 */
export function PopoverMenu({ triggerLabel, triggerIcon, triggerClassName, entries, title, align = "right" }: PopoverMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const closeAndRefocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (idx + 1) % items.length;
    else if (e.key === "ArrowUp") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // foco no primeiro item habilitado
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ??
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
        }
      >
        {triggerIcon}
        {triggerLabel}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 sm:bg-transparent" onClick={closeAndRefocus} aria-hidden="true" />
          <div
            id={menuId}
            role="menu"
            onKeyDown={onMenuKeyDown}
            onBlur={(ev) => {
              // Tab para fora do menu fecha
              const next = ev.relatedTarget as Node | null;
              if (next && !ev.currentTarget.contains(next) && next !== triggerRef.current) setOpen(false);
            }}
            aria-label={title ?? triggerLabel}
            className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-2 pb-6 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-1 sm:w-72 sm:rounded-xl sm:p-1.5 sm:pb-1.5 ${
              align === "right" ? "sm:right-0" : "sm:left-0"
            }`}
          >
            {title && <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500 sm:hidden">{title}</p>}
            {entries.map((e) => (
              <button
                key={e.id ?? e.label}
                type="button"
                role="menuitem"
                disabled={e.disabled}
                onClick={() => {
                  setOpen(false);
                  e.onSelect();
                }}
                className={`flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2 sm:text-xs ${
                  e.active ? "bg-red-50 text-[#ee3135]" : "text-slate-800"
                }`}
              >
                {e.icon && <span className="mt-0.5 shrink-0">{e.icon}</span>}
                <span className="min-w-0">
                  <span className="block">{e.label}</span>
                  {e.hint && <span className="block text-[11px] font-normal text-slate-500">{e.hint}</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
