import { Check, AlertTriangle, X } from "lucide-react";
import type { FitStatus } from "@/lib/fit";

const STYLES: Record<FitStatus, { label: string; cls: string; Icon: typeof Check }> = {
  optimal: { label: "Cabe", cls: "bg-emerald-50 border-emerald-300 text-emerald-800", Icon: Check },
  tight: { label: "Justo", cls: "bg-amber-50 border-amber-300 text-amber-900", Icon: AlertTriangle },
  exceeds: { label: "Não cabe", cls: "bg-red-50 border-red-300 text-red-800", Icon: X },
};

export function FitBadge({ status, title }: { status: FitStatus; title?: string }) {
  const { label, cls, Icon } = STYLES[status];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${cls}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
