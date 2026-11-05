"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { BenoitProduct } from "@/data/benoit-catalog";
import { checkProductFit, type FitStatus } from "@/lib/delivery-fit";

export interface DeliveryCheckProps {
  /** Produtos distintos a conferir */
  products: BenoitProduct[];
  className?: string;
}

const STATUS_STYLE: Record<FitStatus, { cls: string; label: string }> = {
  passa: { cls: "text-[#19a565] bg-green-50 border-green-200", label: "Passa" },
  justo: { cls: "text-amber-700 bg-amber-50 border-amber-200", label: "Justo" },
  "não passa": { cls: "text-[#ee3135] bg-red-50 border-red-200", label: "Não passa" },
};

function StatusIcon({ status }: { status: FitStatus }) {
  if (status === "passa") return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />;
  if (status === "justo") return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
  return <XCircle className="h-3.5 w-3.5 shrink-0" />;
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] font-medium text-slate-600">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-[#ee3135]"
      />
    </label>
  );
}

const num = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return n > 0 ? n : undefined;
};

export function DeliveryCheck({ products, className }: DeliveryCheckProps) {
  const [doorW, setDoorW] = useState("72");
  const [doorH, setDoorH] = useState("210");
  const [useHall, setUseHall] = useState(false);
  const [hallW, setHallW] = useState("");
  const [hallW2, setHallW2] = useState("");
  const [useElev, setUseElev] = useState(false);
  const [elW, setElW] = useState("");
  const [elD, setElD] = useState("");
  const [elH, setElH] = useState("");

  const fits = useMemo(() => {
    const dw = num(doorW);
    const dh = num(doorH);
    if (!dw || !dh) return [];
    const hw = useHall ? num(hallW) : undefined;
    const ew = useElev ? num(elW) : undefined;
    const ed = useElev ? num(elD) : undefined;
    const eh = useElev ? num(elH) : undefined;
    return products.map((p) =>
      checkProductFit(p, {
        door: { widthCm: dw, heightCm: dh },
        hall: hw ? { widthCm: hw, widthAfterCm: num(hallW2) } : undefined,
        elevator: ew && ed && eh ? { widthCm: ew, depthCm: ed, heightCm: eh } : undefined,
      })
    );
  }, [products, doorW, doorH, useHall, hallW, hallW2, useElev, elW, elD, elH]);

  return (
    <div className={className}>
      <div className="space-y-2.5">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-slate-700">Porta de entrada (vão livre, cm)</p>
          <div className="flex gap-2">
            <NumField label="Largura" value={doorW} onChange={setDoorW} placeholder="72" />
            <NumField label="Altura" value={doorH} onChange={setDoorH} placeholder="210" />
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Meça o vão livre com a porta aberta (≈ 7 cm menor que a porta). Ex.: porta de 80 cm → 72 cm.
          </p>
        </div>

        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
          <input type="checkbox" checked={useHall} onChange={(e) => setUseHall(e.target.checked)} />
          Há corredor com curva em L
        </label>
        {useHall && (
          <div className="flex gap-2">
            <NumField label="Corredor (cm)" value={hallW} onChange={setHallW} placeholder="100" />
            <NumField label="Após a curva (cm)" value={hallW2} onChange={setHallW2} placeholder="igual" />
          </div>
        )}

        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
          <input type="checkbox" checked={useElev} onChange={(e) => setUseElev(e.target.checked)} />
          Há elevador
        </label>
        {useElev && (
          <div className="flex gap-2">
            <NumField label="Largura" value={elW} onChange={setElW} placeholder="110" />
            <NumField label="Profund." value={elD} onChange={setElD} placeholder="140" />
            <NumField label="Altura" value={elH} onChange={setElH} placeholder="220" />
          </div>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {fits.map((f) => {
          const st = STATUS_STYLE[f.overall];
          return (
            <li key={f.product.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 min-w-0 text-xs font-semibold text-slate-800">{f.product.name}</p>
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.cls}`}
                >
                  <StatusIcon status={f.overall} />
                  {st.label}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Caixa: {f.box.widthCm} × {f.box.heightCm} × {f.box.depthCm} cm
                {f.box.estimated && " (estimada: medidas do produto + 5 cm)"}
              </p>
              <ul className="mt-1.5 space-y-1">
                {f.results.map((r) => (
                  <li
                    key={r.obstacle}
                    className={`flex items-start gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${STATUS_STYLE[r.status].cls}`}
                  >
                    <StatusIcon status={r.status} />
                    <span className="min-w-0">
                      <b className="capitalize">{r.obstacle}:</b> {r.explanation}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-slate-500">
        Estimativa com base nas medidas da embalagem; não substitui a conferência no local.
      </p>
    </div>
  );
}
