export function AnalysisCard({
  title = "Analisi",
  text,
  children,
}: {
  title?: string;
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-mi-card border border-mi-border rounded-2xl p-6 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-2">{title}</p>
      {text && <p className="text-sm text-mi-muted leading-relaxed">{text}</p>}
      {children}
    </div>
  );
}
