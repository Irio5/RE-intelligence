"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { Warehouse, AlertTriangle } from "lucide-react";
import { parseMq, calcolaEuroMq } from "@/lib/utils/metratura";
import { getZonaLabel, getAllZoneCodes } from "@/lib/data/zoneOMI";
import { supabase } from "@/lib/supabase";

const ZONE_ORDINATE = getAllZoneCodes();
const MIN_PAIRS = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

type RawRow = {
  metratura: string;
  prezzo:    number;
  zonaOMI:   string;
  cat:       string;
  garage:    string | boolean | null;
  cantina:   string | boolean | null;
};

type ProcessedRow = { mq: number; eurMq: number; prezzo: number; cat: string };

type PremiumResult = {
  key:         "garage" | "cantina" | "both";
  label:       string;
  median:      number;  // ≥ 0 (clamped)
  p25:         number;
  p75:         number;
  nPairs:      number;
  sufficient:  boolean;
  wasNegative: boolean;
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function hasAcc(v: string | boolean | null | undefined): boolean {
  return v !== false && v !== "FALSE" && v !== "false" && v != null && v !== "";
}

function calcPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fmtK(n: number): string {
  if (n >= 1000) return `€\u202f${Math.round(n).toLocaleString("it-IT")}`;
  return `€\u202f${Math.round(n)}`;
}

/**
 * Matching approach:
 * For each tx in withAcc, find comparable transactions in withoutAcc
 * (same cat, metratura ±20%). Compute the price difference normalized
 * by the comparable's €/mq × tx's mq (removes size effect).
 */
function computeMatchedPremium(
  withAcc:    ProcessedRow[],
  withoutAcc: ProcessedRow[],
): { diffs: number[]; nPairs: number } {
  // Pre-group withoutAcc by category for O(1) lookup
  const byCat = new Map<string, ProcessedRow[]>();
  for (const r of withoutAcc) {
    if (!byCat.has(r.cat)) byCat.set(r.cat, []);
    byCat.get(r.cat)!.push(r);
  }

  const diffs: number[] = [];
  for (const tx of withAcc) {
    const catGroup = byCat.get(tx.cat) ?? [];
    const comps = catGroup.filter(
      r => Math.abs(r.mq - tx.mq) / tx.mq <= 0.20
    );
    if (comps.length === 0) continue;
    // Normalize by comparable €/mq × tx mq → removes size-driven differences
    const compMeanEurMq = comps.reduce((s, r) => s + r.eurMq, 0) / comps.length;
    diffs.push(tx.prezzo - compMeanEurMq * tx.mq);
  }

  return { diffs, nPairs: diffs.length };
}

function buildResult(
  key: "garage" | "cantina" | "both",
  label: string,
  { diffs, nPairs }: { diffs: number[]; nPairs: number },
): PremiumResult {
  const sufficient = nPairs >= MIN_PAIRS;
  const sorted  = [...diffs].sort((a, b) => a - b);
  const median  = sufficient ? calcPercentile(sorted, 50) : 0;
  const p25     = sufficient ? calcPercentile(sorted, 25) : 0;
  const p75     = sufficient ? calcPercentile(sorted, 75) : 0;
  const wasNegative = median < 0;
  return {
    key, label,
    median:  Math.max(0, Math.round(median)),
    p25:     Math.max(0, Math.round(p25)),
    p75:     Math.max(0, Math.round(p75)),
    nPairs,
    sufficient,
    wasNegative,
  };
}

// ── Custom Recharts label ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTopLabel({ x, y, width, value }: any) {
  if (!value || !x || !y || !width) return null;
  return (
    <text
      x={x + width / 2} y={y - 10}
      textAnchor="middle"
      fill="#1C1917" fontSize={13} fontWeight={700}
      fontFamily="var(--font-sans, sans-serif)"
    >
      {fmtK(value)}
    </text>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { name: string; premium: number; p25: number; p75: number; nPairs: number };
  return (
    <div className="bg-white border border-mi-border rounded-xl shadow-card-hover px-4 py-3 text-sm">
      <p className="font-semibold text-mi-text mb-1">{d.name}</p>
      <p className="text-mi-text font-bold">{fmtK(d.premium)}</p>
      <p className="text-mi-subtle text-[12px] mt-0.5">
        range {fmtK(d.p25)} – {fmtK(d.p75)}
      </p>
      <p className="text-mi-subtle text-[12px]">{d.nPairs} coppie comparabili</p>
    </div>
  );
}

// ── Premium card ──────────────────────────────────────────────────────────────

function PremiumCard({ r }: { r: PremiumResult }) {
  const colorLabel: Record<"garage" | "cantina" | "both", string> = {
    garage:  "Garage",
    cantina: "Cantina",
    both:    "Garage + Cantina",
  };
  const accentColor: Record<"garage" | "cantina" | "both", string> = {
    garage:  "#D4A055",
    cantina: "#C97040",
    both:    "#B84C2E",
  };

  return (
    <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-5 flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-mi-subtle uppercase tracking-widest">
        {colorLabel[r.key]}
      </p>

      {!r.sufficient ? (
        <p className="text-[28px] font-semibold text-mi-subtle leading-none">n.d.</p>
      ) : r.wasNegative ? (
        <p className="text-[28px] font-semibold text-mi-subtle leading-none">€ 0</p>
      ) : (
        <p className="text-[32px] font-bold leading-none" style={{ color: accentColor[r.key] }}>
          +{fmtK(r.median)}
        </p>
      )}

      {r.sufficient && !r.wasNegative && (
        <p className="text-[13px] text-mi-muted">
          range {fmtK(r.p25)} – {fmtK(r.p75)}
        </p>
      )}

      <p className="text-[12px] text-mi-subtle mt-auto">
        {r.sufficient
          ? `${r.nPairs} coppie comparabili`
          : r.nPairs === 0
            ? "Nessuna coppia trovata"
            : `Solo ${r.nPairs} coppie (min. ${MIN_PAIRS})`}
      </p>

      {r.wasNegative && r.sufficient && (
        <p className="text-[11px] text-mi-subtle border-t border-mi-border pt-2 mt-1">
          Dati insufficienti per stimare il premium in questa zona.
        </p>
      )}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function PageHeader({ loading }: { loading?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <Warehouse size={20} strokeWidth={1.5} className="text-mi-primary" />
        <h1 className="text-[22px] font-semibold text-mi-text tracking-[-0.02em]">
          Premium garage e cantina
        </h1>
      </div>
      <p className="text-sm text-mi-muted">
        {loading
          ? "Caricamento dati in corso…"
          : "Valore aggiunto in € di garage e cantina, calcolato tramite coppie comparabili."}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PremiumContent() {
  const [raw, setRaw]           = useState<RawRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zona, setZona]         = useState("B17");

  useEffect(() => {
    async function fetchAll() {
      const PAGE = 1000;
      let all: RawRow[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("transazioni")
          .select("metratura,prezzo,zonaOMI,cat,garage,cantina")
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

  // ── Core computation ─────────────────────────────────────────────────────────

  const { results, outlierCount } = useMemo(() => {
    const none: ProcessedRow[] = [], gOnly: ProcessedRow[] = [];
    const cOnly: ProcessedRow[] = [], both: ProcessedRow[] = [];
    let outlierCount = 0;

    for (const r of raw) {
      if (r.zonaOMI !== zona) continue;
      const mq = parseMq(r.metratura);
      if (!mq || mq <= 0) continue;
      const eurMq = calcolaEuroMq(r.prezzo, mq);
      if (eurMq < 500 || eurMq > 10000) { outlierCount++; continue; }

      const g = hasAcc(r.garage);
      const c = hasAcc(r.cantina);
      const row: ProcessedRow = { mq, eurMq, prezzo: r.prezzo, cat: r.cat };
      if (!g && !c) none.push(row);
      else if (g && !c) gOnly.push(row);
      else if (!g && c) cOnly.push(row);
      else both.push(row);
    }

    const results: PremiumResult[] = [
      buildResult("garage",  "Garage",          computeMatchedPremium(gOnly, none)),
      buildResult("cantina", "Cantina",          computeMatchedPremium(cOnly, none)),
      buildResult("both",    "Garage + Cantina", computeMatchedPremium(both,  none)),
    ];

    return { results, outlierCount };
  }, [raw, zona]);

  // ── Chart data (only sufficient, non-negative) ───────────────────────────────

  const chartData = results
    .filter(r => r.sufficient && !r.wasNegative)
    .map(r => ({
      name:    r.label,
      premium: r.median,
      p25:     r.p25,
      p75:     r.p75,
      nPairs:  r.nPairs,
      color:   r.key === "garage" ? "#D4A055" : r.key === "cantina" ? "#C97040" : "#B84C2E",
    }));

  const yMax = chartData.length > 0
    ? Math.ceil(Math.max(...chartData.map(d => d.p75)) * 1.25 / 1000) * 1000
    : 50000;

  // ── Explanation ──────────────────────────────────────────────────────────────

  const spiegazione = useMemo(() => {
    const garage  = results.find(r => r.key === "garage");
    const cantina = results.find(r => r.key === "cantina");
    const both    = results.find(r => r.key === "both");

    const anyInsufficient = results.some(r => !r.sufficient || r.wasNegative);
    const allInsufficient = results.every(r => !r.sufficient || r.wasNegative);

    if (allInsufficient) {
      return "Per questa zona non ci sono abbastanza transazioni comparabili per stimare il premium con affidabilità.";
    }

    let t = `In zona ${zona}`;

    if (garage?.sufficient && !garage.wasNegative) {
      t += `, avere un garage aggiunge mediamente ${fmtK(garage.median)} al valore dell'immobile (range ${fmtK(garage.p25)}–${fmtK(garage.p75)}, basato su ${garage.nPairs} coppie comparabili).`;
    }
    if (cantina?.sufficient && !cantina.wasNegative) {
      t += ` La cantina aggiunge circa ${fmtK(cantina.median)} (range ${fmtK(cantina.p25)}–${fmtK(cantina.p75)}).`;
    }
    if (both?.sufficient && !both.wasNegative && garage?.sufficient && cantina?.sufficient) {
      const sum = (garage?.median ?? 0) + (cantina?.median ?? 0);
      const diff = both.median - sum;
      if (Math.abs(diff) > 2000) {
        t += ` Averli entrambi non è la semplice somma: il premium combinato è ${fmtK(both.median)} (${diff > 0 ? "+" : ""}${fmtK(diff)} rispetto alla somma dei singoli).`;
      } else {
        t += ` Averli entrambi porta un premium combinato di ${fmtK(both.median)}, circa pari alla somma dei singoli.`;
      }
    }

    if (anyInsufficient && !allInsufficient) {
      t += " Per alcune categorie i dati non sono sufficienti per una stima affidabile.";
    }

    return t;
  }, [results, zona]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const selStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236F6F6F' stroke-width='1.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 10px center",
  };

  if (loading)  return <div className="p-8 max-w-[900px] mx-auto"><PageHeader loading /></div>;
  if (errorMsg) return (
    <div className="p-8 max-w-[900px] mx-auto">
      <PageHeader />
      <div className="mt-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">Errore: {errorMsg}</div>
    </div>
  );

  return (
    <div className="p-8 max-w-[900px] mx-auto space-y-6">
      <PageHeader />

      {/* ── Filter ── */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-mi-muted whitespace-nowrap">Zona OMI</label>
        <select value={zona} onChange={e => setZona(e.target.value)}
          className="h-9 px-3 pr-8 rounded-lg border border-mi-border bg-mi-card text-sm font-medium text-mi-text
                     appearance-none focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors cursor-pointer"
          style={selStyle}>
          {zoneDisponibili.map(z => <option key={z} value={z}>{getZonaLabel(z)}</option>)}
        </select>
      </div>

      {/* ── 3 premium cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {results.map(r => <PremiumCard key={r.key} r={r} />)}
      </div>

      {/* ── Bar chart ── */}
      {chartData.length > 0 && (
        <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
          <p className="text-[11px] font-semibold text-mi-subtle uppercase tracking-widest mb-4">
            Premium assoluto in €
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 36, right: 20, bottom: 8, left: 16 }} barCategoryGap="40%">
              <CartesianGrid strokeDasharray="0" stroke="#F0F0F0" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 13, fill: "#4A4A48", fontWeight: 500 }}
                tickLine={false}
                axisLine={{ stroke: "#EBEBEB" }}
              />
              <YAxis
                domain={[0, yMax]}
                tick={{ fontSize: 11, fill: "#9E9E9E" }}
                tickLine={false}
                axisLine={false}
                width={60}
                tickFormatter={v => `€${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(184,76,46,0.04)" }} />
              <Bar dataKey="premium" radius={[6, 6, 0, 0]} isAnimationActive={false} maxBarSize={120}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.85} />)}
                <LabelList dataKey="premium" position="top" content={BarTopLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Warnings ── */}
      {outlierCount > 0 && (
        <div className="flex items-start gap-2.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          <span>
            <strong>{outlierCount.toLocaleString("it-IT")}</strong> transazioni escluse come outlier (€/mq &lt; 500 o &gt; 10.000).
          </span>
        </div>
      )}

      {/* ── Explanation ── */}
      {spiegazione && (
        <div className="bg-mi-card border border-mi-border rounded-2xl p-6 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-2">Analisi</p>
          <p className="text-sm text-mi-muted leading-relaxed">{spiegazione}</p>
        </div>
      )}
    </div>
  );
}
