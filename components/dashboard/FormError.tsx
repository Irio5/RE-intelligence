import { AlertTriangle } from "lucide-react";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mt-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
