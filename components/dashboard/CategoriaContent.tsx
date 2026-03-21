"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { Tag, BookOpen } from "lucide-react";
import { parseMq, calcolaEuroMq } from "@/lib/utils/metratura";
import { getZonaLabel, getAllZoneCodes } from "@/lib/data/zoneOMI";
import { supabase } from "@/lib/supabase";

const ZONE_ORDINATE = getAllZoneCodes();
const MIN_TX = 3;

// ── Fiscal estimates for 70mq in Milan (indicative) ───────────────────────────

const FISCAL: Record<string, { min: number; max: number }> = {
  A02: { min: 1800, max: 2200 },
  A03: { min: 1200, max: 1600 },
  A04: { min: 800,  max: 1100 },
};

// ── Category labels ───────────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  A01: "A/1 · Signorile",
  A02: "A/2 · Civile",
  A03: "A/3 · Economica",
  A04: "A/4 · Popolare",
  A05: "A/5 · Ultrapopolare",
  A07: "A/7 · Villini",
  A08: "A/8 · Ville",
  A10: "A/10 · Uffici",
};

function catLabel(cat: string) { return CAT_LABEL[cat] ?? cat; }

// ── Color scale cheap → expensive ─────────────────────────────────────────────

const PALETTE_STEPS = ["#22C55E", "#D4A055", "#C97040", "#B84C2E", "#8B2010"];

function catColor(rank: number, total: number): string {
  if (total <= 1) return PALETTE_STEPS[2];
  const t = rank / (total - 1);
  const idx = t * (PALETTE_STEPS.length - 1);
  const lo = Math.floor(idx), hi = Math.min(Math.ceil(idx), PALETTE_STEPS.length - 1);
  if (lo === hi) return PALETTE_STEPS[lo];
  const s = idx - lo;
  const c = (a: string, b: string, ch: number) =>
    Math.round(parseInt(a.slice(ch, ch + 2), 16) + s * (parseInt(b.slice(ch, ch + 2), 16) - parseInt(a.slice(ch, ch + 2), 16)));
  const [ca, cb] = [PALETTE_STEPS[lo], PALETTE_STEPS[hi]];
  return `rgb(${c(ca, cb, 1)},${c(ca, cb, 3)},${c(ca, cb, 5)})`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RawRow = { metratura: string; prezzo: number; zonaOMI: string; cat: string };

type CatStat = {
  cat:    string;
  mean:   number;
  median: number;
  count:  number;
  pct:    number;
  diffPct: number | null; // vs cheapest
  color:  string;
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function calcPercentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fmt(n: number) { return Math.round(n).toLocaleString("it-IT"); }
function fmtK(n: number) { return `€\u202f${fmt(n)}`; }

// ── Custom bar labels ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CountLabel({ x, y, width, value }: any) {
  if (!value || !x || !y || !width) return null;
  return (
    <text x={x + width / 2} y={y - 22} textAnchor="middle"
      fill="#6F6F6F" fontSize={10} fontFamily="var(--font-sans,sans-serif)">
      {value} tx
    </text>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DiffLabel({ x, y, width, value }: any) {
  if (!value || !x || !y || !width) return null;
  return (
    <text x={x + width / 2} y={y - 10} textAnchor="middle"
      fill="#1C1917" fontSize={11} fontWeight={700} fontFamily="var(--font-sans,sans-serif)">
      {value}
    </text>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function PageHeader({ loading }: { loading?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <Tag size={20} strokeWidth={1.5} className="text-mi-primary" />
        <h1 className="text-[22px] font-semibold text-mi-text tracking-[-0.02em]">
          Impatto categoria catastale
        </h1>
      </div>
      <p className="text-sm text-mi-muted">
        {loading ? "Caricamento dati in corso…" : "Come la categoria catastale (A/2, A/3, A/4…) influenza prezzo e tasse."}
      </p>
    </div>
  );
}

// ── Didactic section ──────────────────────────────────────────────────────────

function SezioneDidattica() {
  const cats = [
    { code: "A/2", name: "Civile",    color: "#B84C2E", text: "Immobile di buon livello. Rendita catastale alta → tasse annuali più alte." },
    { code: "A/3", name: "Economica", color: "#D4A055", text: "Standard. Rendita media → tasse nella norma." },
    { code: "A/4", name: "Popolare",  color: "#22C55E", text: "Livello base. Rendita bassa → tasse più basse." },
  ];

  return (
    <div className="bg-[#FDFCFA] border border-mi-border rounded-2xl p-6 shadow-card">
      <div className="flex items-center gap-2.5 mb-3">
        <BookOpen size={17} strokeWidth={1.5} className="text-mi-primary" />
        <p className="text-[13px] font-semibold text-mi-text">Cos&apos;è la categoria catastale?</p>
      </div>
      <p className="text-sm text-mi-muted leading-relaxed mb-5">
        È la classificazione che lo Stato dà a un immobile. Non è solo un&apos;etichetta — determina quanto paghi di tasse ogni anno
        (IMU, TARI) e il valore catastale su cui si calcolano le imposte di acquisto.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cats.map(c => (
          <div key={c.code}
            className="rounded-xl border border-mi-border bg-white p-4"
            style={{ borderLeftWidth: 3, borderLeftColor: c.color }}
          >
            <p className="text-[12px] font-bold mb-0.5" style={{ color: c.color }}>{c.code} · {c.name}</p>
            <p className="text-[12px] text-mi-muted leading-snug">{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fiscal comparison table ───────────────────────────────────────────────────

function TabellaFiscale({ stats }: { stats: CatStat[] }) {
  const rows = ["A02", "A03", "A04"].map(code => ({
    code,
    label:  CAT_LABEL[code] ?? code,
    stat:   stats.find(s => s.cat === code) ?? null,
    fiscal: FISCAL[code],
  })).filter(r => r.fiscal);

  if (rows.filter(r => r.stat).length < 2) return null;

  const cheapestPrice = rows.reduce((min, r) => r.stat && r.stat.mean < min ? r.stat.mean : min, Infinity);

  return (
    <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-mi-border">
        <p className="text-[11px] font-semibold text-mi-subtle uppercase tracking-widest">
          Confronto A/2 · A/3 · A/4 — Prezzo + Impatto fiscale (stima 70 mq)
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-mi-border/60 text-[11px] font-semibold text-mi-subtle uppercase tracking-wider">
              <th className="px-5 py-3 text-left">Categoria</th>
              <th className="px-5 py-3 text-right">Prezzo medio €/mq</th>
              <th className="px-5 py-3 text-right">Diff. vs più economica</th>
              <th className="px-5 py-3 text-right">IMU + TARI / anno</th>
              <th className="px-5 py-3 text-right">Extra tasse su 10 anni</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ code, label, stat, fiscal }) => {
              const priceDiff = stat && isFinite(cheapestPrice)
                ? Math.round(((stat.mean - cheapestPrice) / cheapestPrice) * 100)
                : null;
              const fiscalMid  = Math.round((fiscal.min + fiscal.max) / 2);
              const cheapFiscal = FISCAL["A04"] ? Math.round((FISCAL["A04"].min + FISCAL["A04"].max) / 2) : 0;
              const extraTasse  = (fiscalMid - cheapFiscal) * 10;
              const isBase = code === "A04";

              return (
                <tr key={code} className="border-b border-mi-border/40 hover:bg-mi-hover/50 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-mi-text">{label}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-mi-text">
                    {stat ? `${fmt(stat.mean)} €/mq` : <span className="text-mi-subtle">n.d.</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold">
                    {isBase
                      ? <span className="text-mi-subtle">—</span>
                      : priceDiff != null
                        ? <span style={{ color: priceDiff > 0 ? "#B84C2E" : "#22C55E" }}>
                            {priceDiff > 0 ? "+" : ""}{priceDiff}%
                          </span>
                        : <span className="text-mi-subtle">n.d.</span>
                    }
                  </td>
                  <td className="px-5 py-3.5 text-right text-mi-muted">
                    {fmtK(fiscal.min)}–{fmtK(fiscal.max)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold">
                    {isBase
                      ? <span className="text-mi-subtle">—</span>
                      : extraTasse > 0
                        ? <span className="text-[#B84C2E]">+{fmtK(extraTasse)}</span>
                        : <span className="text-mi-subtle">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 border-t border-mi-border/40 bg-mi-hover/30">
        <p className="text-[11px] text-mi-subtle">
          Stime indicative basate su aliquote medie Milano per prima casa. Il costo reale dipende dalla rendita catastale specifica e dalle delibere comunali vigenti.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CategoriaContent() {
  const [raw, setRaw]           = useState<RawRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zona, setZona]         = useState("C16");

  useEffect(() => {
    async function fetchAll() {
      const PAGE = 1000;
      let all: RawRow[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("transazioni")
          .select("metratura,prezzo,zonaOMI,cat")
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

  // ── Compute stats per category ────────────────────────────────────────────

  const catStats: CatStat[] = useMemo(() => {
    const acc: Record<string, number[]> = {};
    for (const r of raw) {
      if (r.zonaOMI !== zona) continue;
      const mq = parseMq(r.metratura);
      if (!mq || mq <= 0) continue;
      const eurMq = calcolaEuroMq(r.prezzo, mq);
      if (eurMq < 500 || eurMq > 10000) continue;
      if (!acc[r.cat]) acc[r.cat] = [];
      acc[r.cat].push(eurMq);
    }

    const total = Object.values(acc).reduce((s, v) => s + v.length, 0);
    const entries = Object.entries(acc)
      .filter(([, v]) => v.length >= MIN_TX)
      .map(([cat, vals]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        return { cat, mean: vals.reduce((s, v) => s + v, 0) / vals.length, median: calcPercentile(sorted, 50), count: vals.length };
      })
      .sort((a, b) => a.mean - b.mean);

    const cheapestMean = entries[0]?.mean ?? 0;

    return entries.map((e, i) => ({
      ...e,
      pct:     total > 0 ? Math.round((e.count / total) * 1000) / 10 : 0,
      diffPct: i === 0 ? null : Math.round(((e.mean - cheapestMean) / cheapestMean) * 100),
      color:   catColor(i, entries.length),
    }));
  }, [raw, zona]);

  // ── Chart data ────────────────────────────────────────────────────────────

  const barData = catStats.map(s => ({
    name:    catLabel(s.cat).split(" · ")[0],  // short label for axis
    mean:    Math.round(s.mean),
    count:   s.count,
    diffLbl: s.diffPct != null ? `+${s.diffPct}%` : "base",
    color:   s.color,
  }));

  const distData = catStats.map(s => ({
    name:  catLabel(s.cat).split(" · ")[0],
    pct:   s.pct,
    count: s.count,
    color: s.color,
  }));

  // ── Explanation ───────────────────────────────────────────────────────────

  const spiegazione = useMemo(() => {
    if (catStats.length < 2) return null;
    const prevalent = [...catStats].sort((a, b) => b.count - a.count)[0];
    const cheapest  = catStats[0];
    const a2 = catStats.find(s => s.cat === "A02");
    const a3 = catStats.find(s => s.cat === "A03");

    let t = `In zona ${zona}, la categoria più diffusa è ${catLabel(prevalent.cat)} con ${prevalent.pct}% delle transazioni. `;

    if (a2 && a3) {
      const diff = Math.round(((a2.mean - a3.mean) / a3.mean) * 100);
      t += `Un A/2 costa in media ${fmt(a2.mean)} €/mq contro ${fmt(a3.mean)} €/mq di un A/3: paghi il ${Math.abs(diff)}% ${diff > 0 ? "in più" : "in meno"} all'acquisto. `;
      t += `Ma attenzione: le tasse annuali (IMU, TARI) su un A/2 di 70 mq possono superare quelle di un A/3 equivalente di 400–600 € l'anno — su 10 anni sono 4.000–6.000 € in più. `;
      t += `Se ti propongono un A/3 a prezzo da A/2, stai pagando troppo.`;
    } else if (catStats.length >= 2) {
      const priciest = catStats[catStats.length - 1];
      const diff = Math.round(((priciest.mean - cheapest.mean) / cheapest.mean) * 100);
      t += `La categoria più cara (${catLabel(priciest.cat)}) costa il ${diff}% in più rispetto alla più economica (${catLabel(cheapest.cat)}).`;
    }

    return t;
  }, [catStats, zona]);

  // ── Select style ──────────────────────────────────────────────────────────

  const selStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236F6F6F' stroke-width='1.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 10px center",
  };

  const yMax = barData.length > 0
    ? Math.ceil(Math.max(...barData.map(d => d.mean)) * 1.3 / 500) * 500
    : 6000;

  if (loading)  return <div className="p-4 md:p-8 max-w-[900px] mx-auto"><PageHeader loading /></div>;
  if (errorMsg) return (
    <div className="p-4 md:p-8 max-w-[900px] mx-auto">
      <PageHeader />
      <div className="mt-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">Errore: {errorMsg}</div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-[900px] mx-auto space-y-6">
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

      {/* ── Didactic section ── */}
      <SezioneDidattica />

      {catStats.length < 2 ? (
        <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-10 text-center">
          <p className="text-sm text-mi-subtle">Dati insufficienti per questa zona (min. {MIN_TX} transazioni per categoria).</p>
        </div>
      ) : (
        <>
          {/* ── Price bar chart ── */}
          <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
            <p className="text-[11px] font-semibold text-mi-subtle uppercase tracking-widest mb-1">
              Prezzo medio €/mq per categoria
            </p>
            <p className="text-[12px] text-mi-subtle mb-5">
              Etichetta superiore = differenza % rispetto alla categoria più economica
            </p>
            <div className="h-[220px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 44, right: 20, bottom: 8, left: 16 }} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="0" stroke="#F0F0F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#4A4A48", fontWeight: 500 }} tickLine={false} axisLine={{ stroke: "#EBEBEB" }} />
                <YAxis domain={[0, yMax]} tick={{ fontSize: 11, fill: "#9E9E9E" }} tickLine={false} axisLine={false}
                  width={60} tickFormatter={v => `${(v / 1000).toFixed(1)}k`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-mi-border rounded-xl shadow-card-hover px-4 py-3 text-sm">
                        <p className="font-semibold text-mi-text mb-1">{d.name}</p>
                        <p className="font-bold text-mi-text">{fmt(d.mean)} €/mq</p>
                        <p className="text-mi-subtle text-[12px]">{d.count} transazioni</p>
                        {d.diffLbl !== "base" && <p className="text-[12px] font-semibold text-[#B84C2E]">{d.diffLbl} vs più economica</p>}
                      </div>
                    );
                  }}
                  cursor={{ fill: "rgba(184,76,46,0.04)" }}
                />
                <Bar dataKey="mean" radius={[6, 6, 0, 0]} isAnimationActive={false} maxBarSize={100}>
                  {barData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.88} />)}
                  <LabelList dataKey="count" position="top" content={CountLabel} />
                  <LabelList dataKey="diffLbl" position="top" content={DiffLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>

          {/* ── Distribution chart ── */}
          <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
            <p className="text-[11px] font-semibold text-mi-subtle uppercase tracking-widest mb-5">
              Distribuzione transazioni per categoria (%)
            </p>
            <ResponsiveContainer width="100%" height={Math.max(120, distData.length * 44)}>
              <BarChart data={distData} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 80 }}>
                <CartesianGrid strokeDasharray="0" stroke="#F0F0F0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#9E9E9E" }} tickLine={false}
                  axisLine={false} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#4A4A48", fontWeight: 500 }}
                  tickLine={false} axisLine={false} width={75} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-mi-border rounded-xl shadow-card-hover px-4 py-3 text-sm">
                        <p className="font-semibold text-mi-text mb-1">{d.name}</p>
                        <p className="font-bold text-mi-text">{d.pct}%</p>
                        <p className="text-mi-subtle text-[12px]">{d.count} transazioni</p>
                      </div>
                    );
                  }}
                  cursor={{ fill: "rgba(184,76,46,0.04)" }}
                />
                <Bar dataKey="pct" radius={[0, 6, 6, 0]} isAnimationActive={false} maxBarSize={28}>
                  {distData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.85} />)}
                  <LabelList dataKey="pct" position="right"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => `${v}%`}
                    style={{ fontSize: 12, fontWeight: 600, fill: "#4A4A48" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Fiscal table ── */}
          <TabellaFiscale stats={catStats} />

          {/* ── Explanation ── */}
          {spiegazione && (
            <div className="bg-mi-card border border-mi-border rounded-2xl p-6 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-2">Analisi</p>
              <p className="text-sm text-mi-muted leading-relaxed">{spiegazione}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
