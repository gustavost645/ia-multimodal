"use client";

import React, { useEffect, useState } from "react";
import { FolderOpen, Pencil, Trash2, Check, X } from "lucide-react";
import type { SavedRoom } from "@/lib/scene-types";
import { listSavedRooms, deleteSavedRoom, renameSavedRoom } from "@/lib/saved-rooms";

interface SavedRoomsPanelProps {
  onOpen: (room: SavedRoom) => void;
}

export function SavedRoomsPanel({ onOpen }: SavedRoomsPanelProps) {
  const [rooms, setRooms] = useState<SavedRoom[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSavedRooms()
      .then((r) => {
        if (!cancelled) setRooms(r);
      })
      .catch(() => {
        if (!cancelled) setRooms([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = () => listSavedRooms().then(setRooms).catch(() => setRooms([]));

  const commitRename = async (id: string) => {
    await renameSavedRoom(id, editName);
    setEditingId(null);
    await refresh();
  };

  const remove = async (id: string) => {
    await deleteSavedRoom(id);
    setConfirmId(null);
    await refresh();
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-1">
        <FolderOpen className="w-4 h-4 text-[#ee3135]" />
        Meus ambientes
      </div>
      <p className="text-xs text-slate-500 mb-3">Cômodos que você salvou neste aparelho.</p>

      {rooms === null ? (
        <p className="text-xs text-slate-500">Carregando...</p>
      ) : rooms.length === 0 ? (
        <p className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-3">
          Nenhum ambiente salvo ainda. Depois de simular, use &quot;Salvar ambiente&quot; para guardar o cômodo.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
          {rooms.map((room) => (
            <li key={room.id} className="flex gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={room.roomImage}
                alt={room.name}
                className="w-20 h-16 rounded-lg object-cover shrink-0 border border-slate-200 bg-slate-200"
              />
              <div className="flex-1 min-w-0 space-y-1.5">
                {editingId === room.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={editName}
                      maxLength={60}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(room.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg border border-slate-300"
                      aria-label="Novo nome"
                    />
                    <button onClick={() => commitRename(room.id)} aria-label="Confirmar nome" className="p-1.5 rounded-lg bg-[#19a565] text-white cursor-pointer">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditingId(null)} aria-label="Cancelar" className="p-1.5 rounded-lg bg-slate-200 text-slate-700 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 truncate">{room.name}</h4>
                    <p className="text-[10px] text-slate-500">
                      {new Date(room.updatedAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                )}

                {confirmId === room.id ? (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-rose-700 font-semibold">Excluir?</span>
                    <button onClick={() => remove(room.id)} className="px-2 py-1 rounded-lg bg-[#ee3135] text-white font-bold cursor-pointer">
                      Sim
                    </button>
                    <button onClick={() => setConfirmId(null)} className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 font-semibold cursor-pointer">
                      Não
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onOpen(room)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#ee3135] hover:bg-[#b12124] text-white text-[11px] font-bold cursor-pointer"
                    >
                      Abrir
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(room.id);
                        setEditName(room.name);
                      }}
                      aria-label={`Renomear ${room.name}`}
                      className="p-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmId(room.id)}
                      aria-label={`Excluir ${room.name}`}
                      className="p-1.5 rounded-lg bg-white border border-slate-300 text-rose-700 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
