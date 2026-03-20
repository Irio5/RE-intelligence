"use client";

import { useEffect, useState, useMemo } from "react";
import { Calculator, AlertTriangle } from "lucide-react";
import { parseMq, calcolaEuroMq } from "@/lib/utils/metratura";
import { getZonaLabel, getAllZoneCodes } from "@/lib/data/zoneOMI";
import { supabase } from "@/lib/supabase";

const ZONE_ORDINATE = getAllZoneCodes();
const TOLERANCE = 0.20; // ±20% metratura

// ── Types ────────────────────────────────────────────────────────────────────

type RawRow = {
  attoid: string;
  metratura: string;
  prezzo: number;
  zonaOMI: string;
  cat: string;
  garage: string | boolean | null;
  cantina: string | boolean | null;
};

type Risultato = {
  prezzoStimato: number;
  rangeMin: number;
  rangeMax: number;
  prezzoBar: { min: number; medio: number; max: number };
  nComparabili: number;
  premiumGarage: number | null;
  premiumCantina: number | null;
  inputMq: number;
  zona: string;
  cat: string;
  hasGarage: boolean;
  hasCantina: boolean;
  medianEurMq: number;
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function hasAccessorio(v: string | boolean | null | undefined): boolean {
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

function fmt(n: number) { return Math.round(n).toLocaleString("it-IT"); }

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({
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

// ── Pricing bar ───────────────────────────────────────────────────────────────

// 5-segment U-shape: tallest at edges (represent extremes), shortest at center
const SEG_VIS_H = [44, 36, 28, 36, 44]; // visible heights in px
const BAR_H = 44;
const LABEL_H = 64; // space above bar for marker labels

interface MarkerProps {
  value: number;
  domainMin: number;
  domainMax: number;
  label: string;
  color: string;
  dashed?: boolean;
  totalH: number;
}

function Marker({ value, domainMin, domainMax, label, color, dashed, totalH }: MarkerProps) {
  const raw = (value - domainMin) / (domainMax - domainMin);
  const pct = Math.max(2, Math.min(98, raw * 100));
  return (
    <div
      className="absolute flex flex-col items-center pointer-events-none"
      style={{ left: `${pct}%`, bottom: 0, transform: "translateX(-50%)", height: totalH }}
    >
      {/* Label area */}
      <div className="text-center mb-1 px-1" style={{ height: LABEL_H - 8 }}>
        <p className="text-[10px] font-semibold whitespace-nowrap leading-tight" style={{ color }}>
          {label}
        </p>
        <p className="text-[12px] font-bold text-mi-text whitespace-nowrap leading-tight mt-0.5">
          €&nbsp;{fmt(value)}
        </p>
      </div>
      {/* Connector line */}
      <div
        className="flex-1 w-px"
        style={dashed
          ? { backgroundImage: `repeating-linear-gradient(to bottom, ${color} 0, ${color} 4px, transparent 4px, transparent 7px)` }
          : { backgroundColor: color }}
      />
      {/* Dot */}
      <div className="w-2.5 h-2.5 rounded-full border-2 bg-white shrink-0" style={{ borderColor: color }} />
    </div>
  );
}

// Generate ~5 nicely-rounded tick values between min and max
function buildTicks(min: number, max: number): number[] {
  const range = max - min;
  const rawStep = range / 5;
  // Round step to nearest "nice" value: 5k, 10k, 20k, 25k, 50k, 100k…
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const nice = [1, 2, 2.5, 5, 10];
  const step = magnitude * (nice.find(n => n * magnitude >= rawStep) ?? 10);
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= max; t += step) ticks.push(Math.round(t));
  return ticks;
}

const OVERLAP_THRESHOLD_PCT = 11; // % of bar width — below this, labels overlap
const STAGGER_PX = 30;            // extra connector height per stagger step

function PricingBar({
  domainMin, domainMax,
  prezzoMinimo, prezzoMedio,
  prezzoTarget,
}: {
  domainMin: number; domainMax: number;
  prezzoMinimo: number; prezzoMedio: number;
  prezzoTarget: number | null;
}) {
  // Build marker list with horizontal position
  const raw = [
    { value: prezzoMinimo, label: "Miglior prezzo", color: "#22C55E",  dashed: false },
    { value: prezzoMedio,  label: "Media mercato",  color: "#D4A055",  dashed: false },
    ...(prezzoTarget !== null
      ? [{ value: prezzoTarget, label: "Il tuo target", color: "#4A7C9E", dashed: true }]
      : []),
  ].map(m => ({
    ...m,
    pct: Math.max(2, Math.min(98, ((m.value - domainMin) / (domainMax - domainMin)) * 100)),
    extraH: 0,
  })).sort((a, b) => a.pct - b.pct);

  // Stagger overlapping markers: each marker within threshold of the previous
  // gets an additional STAGGER_PX of connector height, pushing its label higher
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].pct - raw[i - 1].pct < OVERLAP_THRESHOLD_PCT) {
      raw[i].extraH = raw[i - 1].extraH + STAGGER_PX;
    }
  }

  const maxExtraH = Math.max(0, ...raw.map(m => m.extraH));
  const containerH = LABEL_H + BAR_H + maxExtraH;

  return (
    <div className="space-y-3">
      {/* Bar + markers */}
      <div className="relative select-none" style={{ height: containerH }}>
        {/* Markers — each with its own totalH to stagger labels */}
        {raw.map(m => (
          <Marker
            key={m.label}
            value={m.value}
            domainMin={domainMin}
            domainMax={domainMax}
            label={m.label}
            color={m.color}
            dashed={m.dashed}
            totalH={LABEL_H + BAR_H + m.extraH}
          />
        ))}

        {/* Gradient bar — 5-segment U-shape */}
        <div
          className="absolute bottom-0 left-0 right-0 flex overflow-hidden rounded-xl"
          style={{
            height: BAR_H,
            // Gradient: green (cheap) → amber (market) → red (expensive)
            background: "linear-gradient(to right, #22C55E 0%, #85C45E 20%, #D4A055 50%, #C97040 75%, #B84C2E 100%)",
            alignItems: "flex-start",
          }}
        >
          {SEG_VIS_H.map((visH, i) => (
            // White cover = portion hidden from top
            <div
              key={i}
              style={{
                flex: 1,
                height: BAR_H - visH,
                backgroundColor: "var(--mi-bg, #FAF9F6)",
              }}
            />
          ))}
        </div>
      </div>

      {/* X axis with price ticks */}
      <div className="relative h-7">
        {buildTicks(domainMin, domainMax).map(tick => {
          const pct = Math.max(0, Math.min(100, ((tick - domainMin) / (domainMax - domainMin)) * 100));
          return (
            <div
              key={tick}
              className="absolute flex flex-col items-center"
              style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
            >
              <div className="w-px h-1.5 bg-mi-border" />
              <span className="text-[10px] text-mi-subtle mt-0.5 whitespace-nowrap">
                {tick >= 1000000
                  ? `€${(tick / 1000000).toFixed(1)}M`
                  : `€${Math.round(tick / 1000)}k`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Band axis labels */}
      <div className="flex justify-between text-[10px] px-0.5">
        <span className="text-green-600 font-medium">← Conveniente</span>
        <span className="text-mi-subtle">mercato mediano</span>
        <span className="text-red-600 font-medium">Costoso →</span>
      </div>

      {/* Footnote */}
      <div className="rounded-xl bg-mi-hover/60 border border-mi-border/50 px-3.5 py-2.5">
        <p className="text-[11px] text-mi-subtle leading-relaxed">
          * Le performance comprese all&apos;interno dei due rettangoli più alti sono generalmente
          possibili solo per immobili da ristrutturare, che godono di incentivi fiscali notevoli.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StimaContent() {
  const [raw, setRaw] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form state
  const [zona, setZona] = useState("B17");
  const [mqInput, setMqInput] = useState("");
  const [cat, setCat] = useState("A03");
  const [hasGarage, setHasGarage] = useState(false);
  const [hasCantina, setHasCantina] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Results
  const [risultato, setRisultato] = useState<Risultato | null>(null);
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
          .select("attoid,metratura,prezzo,zonaOMI,cat,garage,cantina")
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

  // Keep cat in sync: if current cat not available, pick first
  useEffect(() => {
    if (categorieDisponibili.length > 0 && !categorieDisponibili.includes(cat)) {
      setCat(categorieDisponibili.includes("A03") ? "A03" : categorieDisponibili[0]);
    }
  }, [categorieDisponibili]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputMq = useMemo(() => {
    const v = parseFloat(mqInput);
    return isNaN(v) || v <= 0 ? null : v;
  }, [mqInput]);

  const targetPrice = useMemo(() => {
    const v = parseInt(targetInput.replace(/\D/g, ""), 10);
    return isNaN(v) || v <= 0 ? null : v;
  }, [targetInput]);

  // ── Calculation ─────────────────────────────────────────────────────────────

  function handleCalcola() {
    if (!inputMq) { setFormError("Inserisci la metratura in mq."); return; }
    setFormError(null);

    // Find comparable transactions
    const compEurMq: number[] = [];
    for (const r of raw) {
      if (r.zonaOMI !== zona || r.cat !== cat) continue;
      const mq = parseMq(r.metratura);
      if (!mq || mq <= 0) continue;
      if (mq < inputMq * (1 - TOLERANCE) || mq > inputMq * (1 + TOLERANCE)) continue;
      const eurMq = calcolaEuroMq(r.prezzo, mq);
      if (eurMq < 500 || eurMq > 10000) continue;
      compEurMq.push(eurMq);
    }

    if (compEurMq.length < 3) {
      setFormError(
        `Trovate solo ${compEurMq.length} transazioni comparabili. Prova un'altra categoria catastale o zona OMI.`
      );
      setRisultato(null);
      return;
    }

    const sorted = [...compEurMq].sort((a, b) => a - b);
    const p25 = calcPercentile(sorted, 25);
    const p50 = calcPercentile(sorted, 50);
    const p75 = calcPercentile(sorted, 75);
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const minEurMq = sorted[0];
    const maxEurMq = sorted[sorted.length - 1];

    // Garage / cantina premium (all zone transactions)
    const wGarage: number[] = [], woGarage: number[] = [];
    const wCantina: number[] = [], woCantina: number[] = [];

    for (const r of raw) {
      if (r.zonaOMI !== zona) continue;
      const mq = parseMq(r.metratura);
      if (!mq || mq <= 0) continue;
      const eurMq = calcolaEuroMq(r.prezzo, mq);
      if (eurMq < 500 || eurMq > 10000) continue;
      if (hasAccessorio(r.garage)) wGarage.push(eurMq); else woGarage.push(eurMq);
      if (hasAccessorio(r.cantina)) wCantina.push(eurMq); else woCantina.push(eurMq);
    }

    let premiumGarage: number | null = null;
    let premiumCantina: number | null = null;

    if (wGarage.length >= 5 && woGarage.length >= 5) {
      const medWG  = calcPercentile([...wGarage].sort((a, b) => a - b), 50);
      const medWoG = calcPercentile([...woGarage].sort((a, b) => a - b), 50);
      premiumGarage = Math.round(((medWG - medWoG) / medWoG) * 100);
    }
    if (wCantina.length >= 5 && woCantina.length >= 5) {
      const medWC  = calcPercentile([...wCantina].sort((a, b) => a - b), 50);
      const medWoC = calcPercentile([...woCantina].sort((a, b) => a - b), 50);
      premiumCantina = Math.round(((medWC - medWoC) / medWoC) * 100);
    }

    // Apply accessories premium to estimated price
    let prezzoStimato = Math.round(p50 * inputMq);
    if (hasGarage  && premiumGarage  !== null) prezzoStimato = Math.round(prezzoStimato * (1 + premiumGarage  / 100));
    if (hasCantina && premiumCantina !== null) prezzoStimato = Math.round(prezzoStimato * (1 + premiumCantina / 100));

    setRisultato({
      prezzoStimato,
      rangeMin:   Math.round(p25 * inputMq),
      rangeMax:   Math.round(p75 * inputMq),
      prezzoBar: {
        min:   Math.round(minEurMq * inputMq),
        medio: Math.round(mean    * inputMq),
        max:   Math.round(maxEurMq * inputMq),
      },
      nComparabili: compEurMq.length,
      premiumGarage,
      premiumCantina,
      inputMq,
      zona,
      cat,
      hasGarage,
      hasCantina,
      medianEurMq: Math.round(p50),
    });
    setResultKey(k => k + 1);
  }

  // ── Explanation text ─────────────────────────────────────────────────────────

  function buildSpiegazione(r: Risultato): string {
    let t = `Per un ${r.cat} di ${fmt(r.inputMq)} mq in zona ${r.zona}, il prezzo stimato è ${fmt(r.prezzoStimato)} €`;
    t += ` (mediana €/mq: ${fmt(r.medianEurMq)} €/mq, basato su ${r.nComparabili} transazioni comparabili). `;
    t += `Il 50% delle transazioni simili è stato chiuso tra ${fmt(r.rangeMin)} € e ${fmt(r.rangeMax)} €. `;
    if (r.hasGarage && r.premiumGarage !== null) {
      t += `Il garage aggiunge mediamente il ${r.premiumGarage > 0 ? "+" : ""}${r.premiumGarage}% al valore in questa zona. `;
    }
    if (r.hasCantina && r.premiumCantina !== null) {
      t += `La cantina aggiunge mediamente il ${r.premiumCantina > 0 ? "+" : ""}${r.premiumCantina}% al valore. `;
    }
    if (!r.hasGarage && r.premiumGarage !== null && r.premiumGarage > 2) {
      t += `Nota: in questa zona un garage vale mediamente il ${r.premiumGarage}% in più — potrebbe essere un buon argomento in trattativa. `;
    }
    return t.trim();
  }

  // ── Select style helper ───────────────────────────────────────────────────────

  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236F6F6F' stroke-width='1.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 10px center",
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="p-8 max-w-[900px] mx-auto">
      <PageHeader loading />
    </div>
  );

  if (errorMsg) return (
    <div className="p-8 max-w-[900px] mx-auto">
      <PageHeader />
      <div className="mt-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
        Errore: {errorMsg}
      </div>
    </div>
  );

  // Bar domain: from min comp price with 5% padding, to max of (max comp or target) with 5% padding
  const barMin = risultato ? Math.round(risultato.prezzoBar.min * 0.95) : 0;
  const barMax = risultato
    ? Math.round(Math.max(risultato.prezzoBar.max, targetPrice ?? 0) * 1.05)
    : 1;

  return (
    <div className="p-8 max-w-[900px] mx-auto space-y-6">
      <PageHeader />

      {/* ── Form card ── */}
      <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Zona OMI */}
          <div className="sm:col-span-2">
            <label className="block text-[12px] font-semibold text-mi-muted uppercase tracking-wider mb-1.5">
              Zona OMI
            </label>
            <select
              value={zona}
              onChange={e => setZona(e.target.value)}
              className="w-full h-10 px-3 pr-8 rounded-lg border border-mi-border bg-white text-sm font-medium text-mi-text
                         appearance-none focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors cursor-pointer"
              style={selectStyle}
            >
              {zoneDisponibili.map(z => (
                <option key={z} value={z}>{getZonaLabel(z)}</option>
              ))}
            </select>
          </div>

          {/* Metratura */}
          <div>
            <label className="block text-[12px] font-semibold text-mi-muted uppercase tracking-wider mb-1.5">
              Metratura
            </label>
            <div className="relative">
              <input
                type="number"
                min="10"
                max="1000"
                value={mqInput}
                onChange={e => setMqInput(e.target.value)}
                placeholder="es. 70"
                className="w-full h-10 pl-3 pr-10 rounded-lg border border-mi-border bg-white text-sm font-medium text-mi-text
                           placeholder:text-mi-subtle focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-mi-subtle pointer-events-none">mq</span>
            </div>
          </div>

          {/* Categoria catastale */}
          <div>
            <label className="block text-[12px] font-semibold text-mi-muted uppercase tracking-wider mb-1.5">
              Categoria catastale
            </label>
            <select
              value={cat}
              onChange={e => setCat(e.target.value)}
              className="w-full h-10 px-3 pr-8 rounded-lg border border-mi-border bg-white text-sm font-medium text-mi-text
                         appearance-none focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors cursor-pointer"
              style={selectStyle}
            >
              {categorieDisponibili.length > 0
                ? categorieDisponibili.map(c => <option key={c} value={c}>{c}</option>)
                : <option value="A03">A03</option>}
            </select>
          </div>

          {/* Garage */}
          <div className="flex items-center h-10">
            <Toggle value={hasGarage} onChange={setHasGarage} label="Garage incluso" />
          </div>

          {/* Cantina */}
          <div className="flex items-center h-10">
            <Toggle value={hasCantina} onChange={setHasCantina} label="Cantina inclusa" />
          </div>

          {/* Prezzo target (optional) */}
          <div className="sm:col-span-2">
            <label className="block text-[12px] font-semibold text-mi-muted uppercase tracking-wider mb-1.5">
              Prezzo richiesto <span className="normal-case font-normal text-mi-subtle">(opzionale — per visualizzarlo sulla barra)</span>
            </label>
            <div className="relative max-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mi-subtle pointer-events-none">€</span>
              <input
                type="text"
                inputMode="numeric"
                value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                placeholder="es. 320000"
                className="w-full h-10 pl-7 pr-3 rounded-lg border border-mi-border bg-white text-sm font-medium text-mi-text
                           placeholder:text-mi-subtle focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {formError && (
          <div className="mt-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Submit */}
        <div className="mt-5">
          <button
            onClick={handleCalcola}
            disabled={loading}
            className="inline-flex items-center gap-2 h-10 px-6 rounded-xl bg-mi-primary text-white text-[14px] font-semibold
                       hover:bg-mi-primary-dark active:scale-[0.98] transition-all duration-150 shadow-card disabled:opacity-50"
          >
            <Calculator size={15} strokeWidth={2} />
            Calcola stima
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      {risultato && (
        <div key={resultKey} className="space-y-5 animate-fade-in-up">

          {/* Prezzo stimato card */}
          <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-3">
              Prezzo stimato
            </p>
            <p className="font-display text-[42px] sm:text-[52px] leading-none text-mi-text mb-2">
              € {fmt(risultato.prezzoStimato)}
            </p>
            <p className="text-[15px] text-mi-muted mb-1">
              Range probabile:{" "}
              <span className="font-semibold text-mi-text">
                € {fmt(risultato.rangeMin)} – € {fmt(risultato.rangeMax)}
              </span>
            </p>
            <p className="text-[12px] text-mi-subtle">
              Basato su {risultato.nComparabili} transazioni comparabili ·{" "}
              {fmt(risultato.medianEurMq)} €/mq mediana
            </p>

            {/* Premium badges */}
            {(risultato.hasGarage || risultato.hasCantina) && (
              <div className="flex flex-wrap gap-2 mt-4">
                {risultato.hasGarage && risultato.premiumGarage !== null && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1 rounded-full bg-mi-active-bg text-mi-primary border border-mi-primary/20">
                    Garage +{risultato.premiumGarage}%
                  </span>
                )}
                {risultato.hasCantina && risultato.premiumCantina !== null && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1 rounded-full bg-mi-active-bg text-mi-primary border border-mi-primary/20">
                    Cantina +{risultato.premiumCantina}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Pricing bar card */}
          <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-5">
              Posizionamento sul mercato
            </p>
            <PricingBar
              domainMin={barMin}
              domainMax={barMax}
              prezzoMinimo={risultato.prezzoBar.min}
              prezzoMedio={risultato.prezzoBar.medio}
              prezzoTarget={targetPrice}
            />
          </div>

          {/* Explanation card */}
          <div className="bg-mi-card border border-mi-border rounded-2xl p-6 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-2">
              Analisi
            </p>
            <p className="text-sm text-mi-muted leading-relaxed">
              {buildSpiegazione(risultato)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function PageHeader({ loading }: { loading?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <Calculator size={20} strokeWidth={1.5} className="text-mi-primary" />
        <h1 className="text-[22px] font-semibold text-mi-text tracking-[-0.02em]">
          Stima prezzo giusto
        </h1>
      </div>
      <p className="text-sm text-mi-muted">
        {loading
          ? "Caricamento dati in corso…"
          : "Calcola il prezzo equo di un immobile in base alle transazioni comparabili reali."}
      </p>
    </div>
  );
}
