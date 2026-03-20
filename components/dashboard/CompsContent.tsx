"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, AlertTriangle } from "lucide-react";
import { parseMq, isStimato, calcolaEuroMq } from "@/lib/utils/metratura";
import { getZonaLabel, getAllZoneCodes } from "@/lib/data/zoneOMI";
import { supabase } from "@/lib/supabase";

const ZONE_ORDINATE = getAllZoneCodes();
const MAX_RESULTS = 50;
const MESI = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];

// ── Types ─────────────────────────────────────────────────────────────────────

type RawRow = {
  attoid: string;
  anno: number;
  mese: number;
  metratura: string;
  prezzo: number;
  zonaOMI: string;
  cat: string;
  garage: string | boolean | null;
  cantina: string | boolean | null;
};

type Comp = {
  attoid: string;
  dataLabel: string;
  annoMese: number;   // anno*100+mese for sorting
  prezzo: number;
  mq: number;
  stimato: boolean;
  eurMq: number;
  cat: string;
  garage: boolean;
  cantina: boolean;
  score: number;      // 1–5
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function hasAcc(v: string | boolean | null | undefined): boolean {
  return v !== false && v !== "FALSE" && v !== "false" && v != null && v !== "";
}

function calcScore(
  r: RawRow, mq: number, inputMq: number, cat: string, hasGarage: boolean, hasCantina: boolean
): number {
  let s = 1; // zona stessa: always
  const mqDiff = Math.abs(mq - inputMq) / inputMq;
  if (mqDiff <= 0.05) s += 1;            // very tight mq match
  if (r.cat === cat)  s += 1;            // same category
  if (hasAcc(r.garage)  === hasGarage)   s += 1; // garage matches
  if (hasAcc(r.cantina) === hasCantina)  s += 1; // cantina matches
  return s;
}

function calcPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fmt(n: number)    { return Math.round(n).toLocaleString("it-IT"); }
function fmtEur(n: number) { return `€\u202f${fmt(n)}`; }

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-[3px]">
      {[1,2,3,4,5].map(i => (
        <div
          key={i}
          className="w-[7px] h-[7px] rounded-full"
          style={{
            backgroundColor: i <= score ? "#B84C2E" : undefined,
            border: i <= score ? "none" : "1.5px solid #D4D0CC",
          }}
        />
      ))}
    </div>
  );
}

function Badge({ value }: { value: boolean }) {
  return (
    <span className={[
      "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border",
      value
        ? "bg-green-50 text-green-700 border-green-200"
        : "bg-mi-hover text-mi-subtle border-mi-border",
    ].join(" ")}>
      {value ? "Sì" : "No"}
    </span>
  );
}

function Toggle({
  value, onChange, label,
}: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="flex items-center gap-2.5">
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

function PageHeader({ loading }: { loading?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <Search size={20} strokeWidth={1.5} className="text-mi-primary" />
        <h1 className="text-[22px] font-semibold text-mi-text tracking-[-0.02em]">Comps</h1>
      </div>
      <p className="text-sm text-mi-muted">
        {loading
          ? "Caricamento dati in corso…"
          : "Transazioni simili al tuo immobile — prove oggettive per negoziare."}
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CompsContent() {
  const [raw, setRaw]         = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form
  const [zona,       setZona]      = useState("B17");
  const [mqInput,    setMqInput]   = useState("");
  const [cat,        setCat]       = useState("A03");
  const [hasGarage,  setHasGarage]  = useState(false);
  const [hasCantina, setHasCantina] = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);

  // Results
  const [comps,     setComps]     = useState<Comp[]  | null>(null);
  const [resultKey, setResultKey] = useState(0);

  // Fetch all rows once
  useEffect(() => {
    async function fetchAll() {
      const PAGE = 1000;
      let all: RawRow[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("transazioni")
          .select("attoid,anno,mese,metratura,prezzo,zonaOMI,cat,garage,cantina")
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) { setErrorMsg(error.message); setLoading(false); return; }
        if (!data || data.length === 0) break;
        all = all.concat(data as RawRow[]);
        if (data.length < PAGE) break;
        page++;
      }
      setRaw(all);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const zoneDisponibili = useMemo(() => {
    const dalDB = new Set(raw.map(r => r.zonaOMI));
    return Array.from(new Set([...ZONE_ORDINATE, ...dalDB])).sort();
  }, [raw]);

  const categorieDisponibili = useMemo(() => {
    const cats = new Set(raw.map(r => r.cat).filter(Boolean));
    return Array.from(cats).sort();
  }, [raw]);

  useEffect(() => {
    if (categorieDisponibili.length > 0 && !categorieDisponibili.includes(cat)) {
      setCat(categorieDisponibili.includes("A03") ? "A03" : categorieDisponibili[0]);
    }
  }, [categorieDisponibili]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputMq = useMemo(() => {
    const v = parseFloat(mqInput);
    return isNaN(v) || v <= 0 ? null : v;
  }, [mqInput]);

  // ── Search ──────────────────────────────────────────────────────────────────

  function handleTrova() {
    if (!inputMq) { setFormError("Inserisci la metratura in mq."); return; }
    setFormError(null);

    const candidates: Comp[] = [];

    for (const r of raw) {
      if (r.zonaOMI !== zona) continue;
      const mq = parseMq(r.metratura);
      if (!mq || mq <= 0) continue;
      if (mq < inputMq * 0.80 || mq > inputMq * 1.20) continue;
      const eurMq = calcolaEuroMq(r.prezzo, mq);
      if (eurMq < 500 || eurMq > 10000) continue;

      const anno = Number(r.anno);
      const mese = Number(r.mese);

      candidates.push({
        attoid:    r.attoid,
        dataLabel: `${MESI[mese - 1]} ${anno}`,
        annoMese:  anno * 100 + mese,
        prezzo:    r.prezzo,
        mq,
        stimato:   isStimato(r.metratura),
        eurMq,
        cat:       r.cat,
        garage:    hasAcc(r.garage),
        cantina:   hasAcc(r.cantina),
        score:     calcScore(r, mq, inputMq, cat, hasGarage, hasCantina),
      });
    }

    if (candidates.length === 0) {
      setFormError("Nessuna transazione trovata per questi parametri. Prova un'altra zona o metratura.");
      setComps(null);
      return;
    }

    // Sort: score desc → date desc
    candidates.sort((a, b) =>
      b.score !== a.score ? b.score - a.score : b.annoMese - a.annoMese
    );

    setComps(candidates.slice(0, MAX_RESULTS));
    setResultKey(k => k + 1);
  }

  // ── Derived stats ───────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!comps || comps.length === 0) return null;

    const prezzoMedio = comps.reduce((s, c) => s + c.prezzo, 0) / comps.length;
    const eurMqMedio  = comps.reduce((s, c) => s + c.eurMq,  0) / comps.length;

    const sorted = [...comps].sort((a, b) => a.annoMese - b.annoMese);
    const median  = calcPercentile([...comps].map(c => c.eurMq).sort((a, b) => a - b), 50);

    // Trend: avg €/mq of newest 5 vs oldest 5
    let trendPct: number | null = null;
    if (sorted.length >= 6) {
      const n = Math.min(5, Math.floor(sorted.length / 2));
      const avgOld = sorted.slice(0, n).reduce((s, c) => s + c.eurMq, 0) / n;
      const avgNew = sorted.slice(-n).reduce((s, c) => s + c.eurMq, 0) / n;
      trendPct = Math.round(((avgNew - avgOld) / avgOld) * 100);
    }

    return { prezzoMedio, eurMqMedio, median, trendPct };
  }, [comps]);

  function buildSpiegazione(): string {
    if (!comps || !stats) return "";
    let t = `Abbiamo trovato ${comps.length} transazioni simili alla tua ricerca. `;
    t += `Il prezzo medio è stato ${fmtEur(stats.prezzoMedio)}, con un €/mq medio di ${fmt(stats.eurMqMedio)}. `;
    if (stats.trendPct !== null) {
      if (stats.trendPct > 2) {
        t += `Le transazioni più recenti mostrano un trend in crescita (+${stats.trendPct}% rispetto alle più vecchie). `;
      } else if (stats.trendPct < -2) {
        t += `Le transazioni più recenti mostrano un trend in calo (${stats.trendPct}% rispetto alle più vecchie). `;
      } else {
        t += `Le transazioni più recenti mostrano prezzi stabili rispetto alle più vecchie. `;
      }
    }
    return t;
  }

  // ── Select style ────────────────────────────────────────────────────────────

  const selStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236F6F6F' stroke-width='1.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 10px center",
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading)  return <div className="p-8 max-w-[1100px] mx-auto"><PageHeader loading /></div>;
  if (errorMsg) return (
    <div className="p-8 max-w-[1100px] mx-auto">
      <PageHeader />
      <div className="mt-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
        Errore: {errorMsg}
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-[1100px] mx-auto space-y-6">
      <PageHeader />

      {/* ── Form ── */}
      <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Zona */}
          <div className="sm:col-span-2">
            <label className="block text-[12px] font-semibold text-mi-muted uppercase tracking-wider mb-1.5">
              Zona OMI
            </label>
            <select value={zona} onChange={e => setZona(e.target.value)}
              className="w-full h-10 px-3 pr-8 rounded-lg border border-mi-border bg-white text-sm font-medium text-mi-text
                         appearance-none focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors cursor-pointer"
              style={selStyle}>
              {zoneDisponibili.map(z => <option key={z} value={z}>{getZonaLabel(z)}</option>)}
            </select>
          </div>

          {/* Metratura */}
          <div>
            <label className="block text-[12px] font-semibold text-mi-muted uppercase tracking-wider mb-1.5">
              Metratura
            </label>
            <div className="relative">
              <input type="number" min="10" max="1000" value={mqInput} onChange={e => setMqInput(e.target.value)}
                placeholder="es. 70"
                className="w-full h-10 pl-3 pr-10 rounded-lg border border-mi-border bg-white text-sm font-medium text-mi-text
                           placeholder:text-mi-subtle focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-mi-subtle pointer-events-none">mq</span>
            </div>
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-[12px] font-semibold text-mi-muted uppercase tracking-wider mb-1.5">
              Categoria catastale
            </label>
            <select value={cat} onChange={e => setCat(e.target.value)}
              className="w-full h-10 px-3 pr-8 rounded-lg border border-mi-border bg-white text-sm font-medium text-mi-text
                         appearance-none focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors cursor-pointer"
              style={selStyle}>
              {categorieDisponibili.length > 0
                ? categorieDisponibili.map(c => <option key={c} value={c}>{c}</option>)
                : <option value="A03">A03</option>}
            </select>
          </div>

          {/* Toggles */}
          <div className="flex items-center h-10">
            <Toggle value={hasGarage}  onChange={setHasGarage}  label="Con garage" />
          </div>
          <div className="flex items-center h-10">
            <Toggle value={hasCantina} onChange={setHasCantina} label="Con cantina" />
          </div>
        </div>

        {formError && (
          <div className="mt-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <div className="mt-5">
          <button onClick={handleTrova}
            className="inline-flex items-center gap-2 h-10 px-6 rounded-xl bg-mi-primary text-white text-[14px] font-semibold
                       hover:bg-mi-primary-dark active:scale-[0.98] transition-all duration-150 shadow-card">
            <Search size={15} strokeWidth={2} />
            Trova comparabili
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      {comps && stats && (
        <div key={resultKey} className="space-y-5 animate-fade-in-up">

          {/* Summary card */}
          <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <Stat label="Transazioni" value={String(comps.length)} />
              <Stat label="Prezzo medio"  value={fmtEur(stats.prezzoMedio)} />
              <Stat label="€/mq medio"   value={`${fmt(stats.eurMqMedio)} €/mq`} />
              {stats.trendPct !== null && (
                <Stat
                  label="Trend recente"
                  value={`${stats.trendPct > 0 ? "+" : ""}${stats.trendPct}%`}
                  valueClass={stats.trendPct > 2 ? "text-green-600" : stats.trendPct < -2 ? "text-red-600" : "text-mi-text"}
                />
              )}
            </div>
            <p className="text-[14px] font-semibold text-mi-text border-t border-mi-border pt-4">
              Queste saranno le tue prove oggettive per negoziare.
            </p>
          </div>

          {/* Table */}
          <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] min-w-[720px]">
                <thead>
                  <tr className="border-b border-mi-border bg-white sticky top-0 z-10">
                    {["Data","Prezzo","Mq","€/mq","Categoria","Garage","Cantina","Match"].map(h => (
                      <th key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold text-mi-subtle uppercase tracking-wider whitespace-nowrap first:pl-5 last:pr-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comps.map((c, i) => {
                    const belowMedian = c.eurMq < stats.median;
                    const aboveMedian = c.eurMq > stats.median * 1.02;
                    const rowBg = belowMedian
                      ? "rgba(34,197,94,0.055)"
                      : aboveMedian
                        ? "rgba(239,68,68,0.055)"
                        : "transparent";
                    return (
                      <tr
                        key={c.attoid + i}
                        className="border-b border-mi-border/50 hover:bg-mi-hover/60 transition-colors duration-100"
                        style={{ backgroundColor: rowBg }}
                      >
                        <td className="px-4 py-2.5 pl-5 text-mi-muted whitespace-nowrap">{c.dataLabel}</td>
                        <td className="px-4 py-2.5 font-medium text-mi-text whitespace-nowrap">{fmtEur(c.prezzo)}</td>
                        <td className="px-4 py-2.5 text-mi-text whitespace-nowrap">
                          {fmt(c.mq)}
                          {c.stimato && (
                            <span title="Metratura stimata da vani" className="ml-1 text-amber-500 cursor-help">⚠</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap"
                          style={{ color: belowMedian ? "#16A34A" : aboveMedian ? "#DC2626" : undefined }}>
                          {fmt(c.eurMq)}
                        </td>
                        <td className="px-4 py-2.5 text-mi-muted">{c.cat}</td>
                        <td className="px-4 py-2.5"><Badge value={c.garage} /></td>
                        <td className="px-4 py-2.5"><Badge value={c.cantina} /></td>
                        <td className="px-4 py-2.5 pr-5"><ScoreDots score={c.score} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {comps.length === MAX_RESULTS && (
              <p className="px-5 py-3 text-[11px] text-mi-subtle border-t border-mi-border">
                Mostrate le prime {MAX_RESULTS} transazioni più simili.
              </p>
            )}
          </div>

          {/* Explanation */}
          <div className="bg-mi-card border border-mi-border rounded-2xl p-6 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-2">Analisi</p>
            <p className="text-sm text-mi-muted leading-relaxed">{buildSpiegazione()}</p>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-5 text-[11px] text-mi-subtle px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(34,197,94,0.25)" }} />
              <span>€/mq sotto la mediana (conveniente)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "rgba(239,68,68,0.2)" }} />
              <span>€/mq sopra la mediana</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-500">⚠</span>
              <span>Metratura stimata da vani (1 vano = 20 mq)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-mi-subtle uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-[17px] font-semibold text-mi-text ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}
