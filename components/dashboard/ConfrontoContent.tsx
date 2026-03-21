"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Scale, ChevronDown, X } from "lucide-react";
import { parseMq, calcolaEuroMq } from "@/lib/utils/metratura";
import { getZonaLabel, getAllZoneCodes } from "@/lib/data/zoneOMI";
import { supabase } from "@/lib/supabase";

const ZONE_ORDINATE = getAllZoneCodes();
const MAX_ZONES = 5;
const DEFAULT_ZONES = ["C15", "C16", "C17"];
const PALETTE = ["#B84C2E", "#D4A055", "#4A7C9E", "#22C55E", "#8B5CF6"];
const MIN_PAIRS = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

type RawRow = {
  anno:      number;
  mese:      number;
  metratura: string;
  prezzo:    number;
  zonaOMI:   string;
  cat:       string;
  garage:    string | boolean | null;
  cantina:   string | boolean | null;
};

type ProcessedRow = { mq: number; eurMq: number; prezzo: number; cat: string };

type ZoneStats = {
  zona:           string;
  meanEurMq:      number;
  medianEurMq:    number;
  count:          number;
  volEur:         number;
  trendPct:       number | null;
  premiumGarage:  number | null;
  premiumCantina: number | null;
  catPrev:        string;
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function hasAcc(v: string | boolean | null | undefined): boolean {
  return v !== false && v !== "FALSE" && v !== "false" && v != null && v !== "";
}

function calcPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function normalize(value: number, min: number, max: number, invert = false): number {
  if (max === min) return 50;
  const n = ((value - min) / (max - min)) * 100;
  return Math.round(invert ? 100 - n : n);
}

function fmt(n: number) { return Math.round(n).toLocaleString("it-IT"); }

function fmtK(n: number): string {
  if (n >= 1000) return `€\u202f${Math.round(n).toLocaleString("it-IT")}`;
  return `€\u202f${Math.round(n)}`;
}

function calcPercentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeMatchedPremium(
  withAcc: ProcessedRow[],
  withoutAcc: ProcessedRow[],
): { median: number | null; nPairs: number } {
  const byCat = new Map<string, ProcessedRow[]>();
  for (const r of withoutAcc) {
    if (!byCat.has(r.cat)) byCat.set(r.cat, []);
    byCat.get(r.cat)!.push(r);
  }
  const diffs: number[] = [];
  for (const tx of withAcc) {
    const catGroup = byCat.get(tx.cat) ?? [];
    const comps = catGroup.filter(r => Math.abs(r.mq - tx.mq) / tx.mq <= 0.20);
    if (comps.length === 0) continue;
    const compMeanEurMq = comps.reduce((s, r) => s + r.eurMq, 0) / comps.length;
    diffs.push(tx.prezzo - compMeanEurMq * tx.mq);
  }
  if (diffs.length < MIN_PAIRS) return { median: null, nPairs: diffs.length };
  const sorted = [...diffs].sort((a, b) => a - b);
  const m = calcPercentileSorted(sorted, 50);
  return { median: Math.max(0, Math.round(m)), nPairs: diffs.length };
}

function computeZoneStats(rows: RawRow[], zona: string): ZoneStats | null {
  type V = { mq: number; eurMq: number; prezzo: number; annoMese: number; garage: boolean; cantina: boolean; cat: string };
  const vals: V[] = [];

  for (const r of rows) {
    if (r.zonaOMI !== zona) continue;
    const mq = parseMq(r.metratura);
    if (!mq || mq <= 0) continue;
    const eurMq = calcolaEuroMq(r.prezzo, mq);
    if (eurMq < 500 || eurMq > 10000) continue;
    vals.push({
      mq,
      eurMq,
      prezzo:   r.prezzo,
      annoMese: Number(r.anno) * 100 + Number(r.mese),
      garage:   hasAcc(r.garage),
      cantina:  hasAcc(r.cantina),
      cat:      r.cat,
    });
  }

  if (vals.length < 3) return null;

  const eurMqs  = vals.map(v => v.eurMq);
  const sorted  = [...eurMqs].sort((a, b) => a - b);
  const mean    = eurMqs.reduce((s, v) => s + v, 0) / eurMqs.length;
  const median  = calcPercentile(sorted, 50);
  const volEur  = vals.reduce((s, v) => s + v.prezzo, 0);

  // Trend: first 25% of dates vs last 25%
  const byDate  = [...vals].sort((a, b) => a.annoMese - b.annoMese);
  let trendPct: number | null = null;
  if (byDate.length >= 8) {
    const n     = Math.max(3, Math.floor(byDate.length * 0.25));
    const early = byDate.slice(0, n).map(v => v.eurMq);
    const late  = byDate.slice(-n).map(v => v.eurMq);
    const eM    = early.reduce((s, v) => s + v, 0) / early.length;
    const lM    = late.reduce((s, v) => s + v, 0) / late.length;
    trendPct    = Math.round(((lM - eM) / eM) * 100);
  }

  const catCount = new Map<string, number>();
  for (const v of vals) catCount.set(v.cat, (catCount.get(v.cat) ?? 0) + 1);
  const catPrev = Array.from(catCount.entries()).sort(([,a],[,b]) => b - a)[0]?.[0] ?? "—";

  // Premium garage / cantina via matching comparables
  const toRow = (v: V): ProcessedRow => ({ mq: v.mq, eurMq: v.eurMq, prezzo: v.prezzo, cat: v.cat });
  const none    = vals.filter(v => !v.garage && !v.cantina).map(toRow);
  const gOnly   = vals.filter(v =>  v.garage && !v.cantina).map(toRow);
  const cOnly   = vals.filter(v => !v.garage &&  v.cantina).map(toRow);
  const { median: premiumGarage  } = computeMatchedPremium(gOnly, none);
  const { median: premiumCantina } = computeMatchedPremium(cOnly, none);

  return {
    zona,
    meanEurMq:   Math.round(mean),
    medianEurMq: Math.round(median),
    count:       vals.length,
    volEur,
    trendPct,
    premiumGarage,
    premiumCantina,
    catPrev,
  };
}

// ── Zone multi-select ──────────────────────────────────────────────────────────

function ZoneMultiSelect({
  available, selected, onToggle,
}: { available: string[]; selected: string[]; onToggle: (z: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg border border-mi-border bg-mi-card text-sm font-medium text-mi-text
                   hover:border-mi-primary/40 focus:outline-none focus:ring-2 focus:ring-mi-primary/20 transition-colors"
      >
        <span>{selected.length} {selected.length === 1 ? "zona" : "zone"} selezionate</span>
        <ChevronDown size={13} strokeWidth={1.5} className={`text-mi-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-white border border-mi-border rounded-xl shadow-lg w-72 max-h-72 overflow-y-auto">
          <div className="p-1.5 sticky top-0 bg-white border-b border-mi-border/50 px-3 py-2">
            <p className="text-[11px] text-mi-subtle">
              Seleziona 2–{MAX_ZONES} zone · {selected.length}/{MAX_ZONES} selezionate
            </p>
          </div>
          {available.map(z => {
            const isSelected = selected.includes(z);
            const disabled   = !isSelected && selected.length >= MAX_ZONES;
            return (
              <label
                key={z}
                className={[
                  "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors",
                  disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-mi-hover",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => !disabled && onToggle(z)}
                  className="accent-mi-primary w-3.5 h-3.5"
                />
                <span className="text-[13px] text-mi-text">{getZonaLabel(z)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Table best-cell helper ─────────────────────────────────────────────────────

function bestIndex(values: (number | null)[], better: "lower" | "higher"): number | null {
  const nums = values.map((v, i) => v != null ? { v, i } : null).filter(Boolean) as { v: number; i: number }[];
  if (nums.length < 2) return null;
  return (better === "lower"
    ? nums.reduce((b, c) => c.v < b.v ? c : b)
    : nums.reduce((b, c) => c.v > b.v ? c : b)
  ).i;
}

// ── Page header ───────────────────────────────────────────────────────────────

function PageHeader({ loading }: { loading?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <Scale size={20} strokeWidth={1.5} className="text-mi-primary" />
        <h1 className="text-[22px] font-semibold text-mi-text tracking-[-0.02em]">Confronto zone</h1>
      </div>
      <p className="text-sm text-mi-muted">
        {loading ? "Caricamento dati in corso…" : "Confronta fino a 5 zone OMI su prezzi, trend, volume e accessori."}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ConfrontoContent() {
  const [raw, setRaw]             = useState<RawRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [selected, setSelected]   = useState<string[]>(DEFAULT_ZONES);

  useEffect(() => {
    async function fetchAll() {
      const PAGE = 1000;
      let all: RawRow[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("transazioni")
          .select("anno,mese,metratura,prezzo,zonaOMI,cat,garage,cantina")
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

  function toggleZone(z: string) {
    setSelected(prev =>
      prev.includes(z)
        ? prev.length > 2 ? prev.filter(x => x !== z) : prev  // keep min 2
        : prev.length < MAX_ZONES ? [...prev, z] : prev
    );
  }

  // ── Stats per zone ──────────────────────────────────────────────────────────

  const allStats: ZoneStats[] = useMemo(() =>
    selected
      .map(z => computeZoneStats(raw, z))
      .filter((s): s is ZoneStats => s !== null),
  [raw, selected]);

  // ── Radar data ──────────────────────────────────────────────────────────────

  const radarData = useMemo(() => {
    if (allStats.length < 2) return [];

    const ext = (key: (s: ZoneStats) => number) => {
      const vals = allStats.map(key);
      return { min: Math.min(...vals), max: Math.max(...vals) };
    };

    const priceE   = ext(s => s.medianEurMq);
    const trendE   = ext(s => s.trendPct ?? 0);
    const volE     = ext(s => s.volEur);
    const garageE  = ext(s => s.premiumGarage ?? 0);
    const cantinaE = ext(s => s.premiumCantina ?? 0);

    const axes = [
      { subject: "Convenienza",   fn: (s: ZoneStats) => normalize(s.medianEurMq,          priceE.min,   priceE.max,   true)  },
      { subject: "Trend",         fn: (s: ZoneStats) => normalize(s.trendPct ?? 0,         trendE.min,   trendE.max)          },
      { subject: "Volume (€)",    fn: (s: ZoneStats) => normalize(s.volEur,                volE.min,     volE.max)            },
      { subject: "Prm. Garage",   fn: (s: ZoneStats) => normalize(s.premiumGarage  ?? 0,  garageE.min,  garageE.max)         },
      { subject: "Prm. Cantina",  fn: (s: ZoneStats) => normalize(s.premiumCantina ?? 0,  cantinaE.min, cantinaE.max)        },
    ];

    return axes.map(({ subject, fn }) => {
      const row: Record<string, unknown> = { subject };
      for (const s of allStats) row[s.zona] = fn(s);
      return row;
    });
  }, [allStats]);

  // ── Table metric rows ───────────────────────────────────────────────────────

  type MetricDef = {
    label: string;
    values: (string | number | null)[];
    numericValues: (number | null)[];
    better: "lower" | "higher" | "none";
    highlightColor: "green" | "red";
    format: (v: number | null) => string;
  };

  const metrics: MetricDef[] = useMemo(() => {
    if (allStats.length === 0) return [];
    const f = (
      better: "lower" | "higher" | "none",
      highlightColor: "green" | "red",
      label: string,
      num: (s: ZoneStats) => number | null,
      fmt: (v: number | null) => string,
    ): MetricDef => ({
      label,
      values:        allStats.map(s => num(s)),
      numericValues: allStats.map(s => num(s)),
      better,
      highlightColor,
      format: fmt,
    });
    const volFmt = (v: number | null) => {
      if (v == null) return "—";
      if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} Mld €`;
      if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)} M€`;
      return `${fmt(v)} €`;
    };
    return [
      f("lower",  "green", "Prezzo medio €/mq",        s => s.meanEurMq,       v => v == null ? "—" : `${fmt(v)} €/mq`),
      f("lower",  "green", "Mediana €/mq",             s => s.medianEurMq,     v => v == null ? "—" : `${fmt(v)} €/mq`),
      f("higher", "green", "N. transazioni",           s => s.count,           v => v == null ? "—" : fmt(v)),
      f("higher", "green", "Volume transazioni",       s => s.volEur,          volFmt),
      f("lower",  "green", "Trend storico → recente",  s => s.trendPct,        v => v == null ? "n.d." : `${v >= 0 ? "+" : ""}${v}%`),
      f("lower",  "green", "Premium garage",           s => s.premiumGarage,   v => v == null ? "n.d." : `+${fmtK(v)}`),
      f("lower",  "green", "Premium cantina",          s => s.premiumCantina,  v => v == null ? "n.d." : `+${fmtK(v)}`),
      { label: "Categoria prevalente",
        values: allStats.map(s => s.catPrev),
        numericValues: allStats.map(() => null),
        better: "none", highlightColor: "green", format: v => String(v ?? "—") },
    ];
  }, [allStats]);

  // ── Explanation ─────────────────────────────────────────────────────────────

  const spiegazione = useMemo(() => {
    if (allStats.length < 2) return null;

    if (allStats.length === 2) {
      const [a, b] = allStats;
      const cheaperIdx = a.medianEurMq <= b.medianEurMq ? 0 : 1;
      const cheaper = allStats[cheaperIdx], pricier = allStats[1 - cheaperIdx];
      const priceDiff = Math.round(((pricier.medianEurMq - cheaper.medianEurMq) / cheaper.medianEurMq) * 100);
      const trendWinner = (a.trendPct ?? 0) >= (b.trendPct ?? 0) ? a : b;
      const volumeWinner = a.count >= b.count ? a : b;

      let t = `Zona ${cheaper.zona} vs ${pricier.zona}: ${cheaper.zona} costa il ${priceDiff}% in meno (${fmt(cheaper.medianEurMq)} vs ${fmt(pricier.medianEurMq)} €/mq).`;
      t += ` ${volumeWinner.zona} ha un mercato più liquido (${fmt(volumeWinner.count)} transazioni).`;
      if (trendWinner.trendPct != null) {
        t += ` Il trend di crescita migliore è in ${trendWinner.zona} (${trendWinner.trendPct != null && trendWinner.trendPct >= 0 ? "+" : ""}${trendWinner.trendPct}% nel periodo analizzato).`;
      }
      if (priceDiff >= 10 && (trendWinner.zona === cheaper.zona || cheaper.count >= pricier.count)) {
        t += ` Se cerchi valore a lungo termine, ${cheaper.zona} offre un ingresso più accessibile con potenziale di rivalutazione.`;
      }
      return t;
    }

    // 3+ zones
    const byPrice  = [...allStats].sort((a, b) => a.medianEurMq - b.medianEurMq);
    const byTrend  = [...allStats].filter(s => s.trendPct != null).sort((a, b) => (b.trendPct ?? 0) - (a.trendPct ?? 0));
    const byVolume = [...allStats].sort((a, b) => b.count - a.count);

    let t = `Tra le ${allStats.length} zone analizzate: `;
    t += `la più conveniente è ${byPrice[0].zona} (${fmt(byPrice[0].medianEurMq)} €/mq mediana), `;
    t += `la più cara è ${byPrice[byPrice.length - 1].zona} (${fmt(byPrice[byPrice.length - 1].medianEurMq)} €/mq). `;
    if (byTrend.length > 0 && byTrend[0].trendPct != null) {
      t += `Il trend di crescita più forte è in ${byTrend[0].zona} (+${byTrend[0].trendPct}%). `;
    }
    t += `Il mercato più liquido (maggior numero di transazioni) è ${byVolume[0].zona} (${fmt(byVolume[0].count)} transazioni).`;
    return t;
  }, [allStats]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading)  return <div className="p-4 md:p-8 max-w-[1100px] mx-auto"><PageHeader loading /></div>;
  if (errorMsg) return (
    <div className="p-4 md:p-8 max-w-[1100px] mx-auto">
      <PageHeader />
      <div className="mt-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">Errore: {errorMsg}</div>
    </div>
  );

  const colorMap = Object.fromEntries(allStats.map((s, i) => [s.zona, PALETTE[i % PALETTE.length]]));

  return (
    <div className="p-4 md:p-8 max-w-[1100px] mx-auto space-y-6">
      <PageHeader />

      {/* ── Zone selector + badges ── */}
      <div className="flex flex-wrap items-center gap-3">
        <ZoneMultiSelect available={zoneDisponibili} selected={selected} onToggle={toggleZone} />
        <div className="flex flex-wrap gap-2">
          {selected.map(z => (
            <span
              key={z}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full border"
              style={{ color: colorMap[z], borderColor: colorMap[z] + "50", backgroundColor: colorMap[z] + "12" }}
            >
              {z}
              {selected.length > 2 && (
                <button onClick={() => toggleZone(z)} className="opacity-60 hover:opacity-100 transition-opacity">
                  <X size={10} strokeWidth={2} />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {allStats.length >= 2 ? (
        <>
          {/* ── Comparison table ── */}
          <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b-2 border-mi-border">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-mi-subtle uppercase tracking-wider w-44">
                      Metrica
                    </th>
                    {allStats.map(s => (
                      <th key={s.zona} className="px-5 py-3 text-left">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorMap[s.zona] }} />
                          <div>
                            <p className="text-[13px] font-semibold text-mi-text">{s.zona}</p>
                            <p className="text-[11px] font-normal text-mi-subtle normal-case tracking-normal leading-tight">
                              {getZonaLabel(s.zona).split(" - ")[1] ?? ""}
                            </p>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m, ri) => {
                    const best = m.better !== "none"
                      ? bestIndex(m.numericValues, m.better)
                      : null;
                    const textColor   = m.highlightColor === "red" ? "#DC2626" : "#16A34A";
                    const bgColor     = m.highlightColor === "red" ? "rgba(239,68,68,0.07)" : "rgba(34,197,94,0.07)";
                    return (
                      <tr key={ri} className="border-b border-mi-border/50 hover:bg-mi-hover/50 transition-colors">
                        <td className="px-5 py-3 text-[12px] font-medium text-mi-muted whitespace-nowrap">{m.label}</td>
                        {allStats.map((s, ci) => {
                          const raw = m.numericValues[ci];
                          const isBest = best === ci;
                          return (
                            <td key={s.zona} className="px-5 py-3 font-medium whitespace-nowrap"
                              style={{
                                color: isBest ? textColor : undefined,
                                backgroundColor: isBest ? bgColor : undefined,
                              }}>
                              {m.format(raw as number | null)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Radar chart ── */}
          <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
            <p className="text-[11px] font-semibold text-mi-subtle uppercase tracking-widest mb-1">
              Confronto radar — valori normalizzati 0–100
            </p>
            <p className="text-[12px] text-mi-subtle mb-5">
              100 = migliore nella categoria · "Convenienza" invertita (costo minore = punteggio maggiore) · Premium in € via coppie comparabili
            </p>
            <div className="h-[260px] md:h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
                <PolarGrid stroke="#EBEBEB" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 11, fill: "#6F6F6F", fontWeight: 500 }}
                />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip
                  content={({ payload, label }) => {
                    if (!payload?.length) return null;
                    return (
                      <div className="bg-white border border-mi-border rounded-xl shadow-card-hover px-3 py-2.5 text-xs">
                        <p className="font-semibold text-mi-text mb-1.5">{label}</p>
                        {payload.map((p, i) => (
                          <p key={i} style={{ color: colorMap[p.dataKey as string] }}>
                            {String(p.dataKey)}: {String(p.value)}/100
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                {allStats.map((s, i) => (
                  <Radar
                    key={s.zona}
                    name={s.zona}
                    dataKey={s.zona}
                    stroke={PALETTE[i % PALETTE.length]}
                    fill={PALETTE[i % PALETTE.length]}
                    fillOpacity={0.10}
                    strokeWidth={2}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
            </div>

            {/* Custom legend — below chart, no overlap */}
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-4">
              {allStats.map((s, i) => (
                <div key={s.zona} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  <span className="text-[12px] font-semibold" style={{ color: PALETTE[i % PALETTE.length] }}>
                    {s.zona}
                  </span>
                  <span className="hidden sm:inline text-[12px] text-mi-muted">
                    · {getZonaLabel(s.zona).split(" - ")[1] ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Explanation ── */}
          {spiegazione && (
            <div className="bg-mi-card border border-mi-border rounded-2xl p-6 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-2">Analisi</p>
              <p className="text-sm text-mi-muted leading-relaxed">{spiegazione}</p>
            </div>
          )}
        </>
      ) : (
        <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-12 text-center">
          <p className="text-sm text-mi-subtle">Seleziona almeno 2 zone per avviare il confronto.</p>
        </div>
      )}
    </div>
  );
}
