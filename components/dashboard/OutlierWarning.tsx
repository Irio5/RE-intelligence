import { AlertTriangle } from "lucide-react";

export function OutlierWarning({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-start gap-2.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" />
      <span>
        <strong>{count.toLocaleString("it-IT")}</strong>{" "}
        transazioni escluse come outlier (€/mq &lt; 500 o &gt; 10.000 — probabili errori nei dati).
      </span>
    </div>
  );
}
