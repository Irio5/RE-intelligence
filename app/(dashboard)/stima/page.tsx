import { Calculator } from "lucide-react";

export default function StimaPage() {
  return (
    <div className="p-8 max-w-[1100px] mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1.5">
          <Calculator size={20} strokeWidth={1.5} className="text-mi-primary" />
          <h1 className="text-[22px] font-semibold text-mi-text tracking-[-0.02em]">
            Stima prezzo giusto
          </h1>
        </div>
        <p className="text-sm text-mi-muted">Calcola il prezzo equo di un immobile in base alle transazioni reali comparabili.</p>
      </div>
      <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-16 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-mi-hover flex items-center justify-center mb-4">
          <Calculator size={22} strokeWidth={1.5} className="text-mi-subtle" />
        </div>
        <p className="text-sm font-medium text-mi-text mb-1">In costruzione</p>
        <p className="text-sm text-mi-subtle">Questa funzionalità sarà disponibile a breve.</p>
      </div>
    </div>
  );
}
