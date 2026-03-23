export function Toggle({
  value, onChange, label,
}: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="flex items-center gap-2.5 group">
      <div className={[
        "relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0",
        value ? "bg-mi-primary" : "bg-mi-hover border border-mi-border",
      ].join(" ")}>
        <div className={[
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200",
          value ? "translate-x-4" : "translate-x-0.5",
        ].join(" ")} />
      </div>
      <span className="text-sm font-medium text-mi-text">{label}</span>
    </button>
  );
}
