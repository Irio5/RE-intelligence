"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts";
import { BarChart2 } from "lucide-react";
import { parseMq, calcolaEuroMq } from "@/lib/utils/metratura";
import { getZonaLabel, buildZoneList } from "@/lib/data/zoneOMI";
import { fetchAllPages } from "@/lib/utils/fetchAllPages";
import { calcPercentile } from "@/lib/utils/stats";
import { SELECT_STYLE } from "@/lib/utils/selectStyle";
import { AnalysisCard } from "@/components/dashboard/AnalysisCard";
import { OutlierWarning } from "@/components/dashboard/OutlierWarning";

const BUCKET_SIZE = 200;

type RawRow = {
  attoid: string;
  metratura: string;
  prezzo: number;
  zonaOMI: string;
};

type BucketData = {
  x: number;
  count: number;
  label: string;
};

function buildBuckets(values: number[]): {
  buckets: BucketData[];
  minBucket: number;
  maxBucket: number;
} {
  if (values.length === 0) return { buckets: [], minBucket: 0, maxBucket: 0 };
  let minVal = Infinity, maxVal = -Infinity;
  for (const v of values) {
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  const minBucket = Math.floor(minVal / BUCKET_SIZE) * BUCKET_SIZE;
  const maxBucket = Math.ceil(maxVal  / BUCKET_SIZE) * BUCKET_SIZE;
  const counts = new Map<number, number>();
  for (let b = minBucket; b < maxBucket; b += BUCKET_SIZE) counts.set(b, 0);
  for (const v of values) {
    const b = Math.floor(v / BUCKET_SIZE) * BUCKET_SIZE;
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const buckets: BucketData[] = Array.from(counts.entries())
    .sort(([a], [b]) => a - b)
    .map(([b, count]) => ({
      x: b + BUCKET_SIZE / 2,
      count,
      label: `${b.toLocaleString("it-IT")}–${(b + BUCKET_SIZE).toLocaleString("it-IT")}`,
    }));
  return { buckets, minBucket, maxBucket };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: BucketData }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-mi-border rounded-xl shadow-card-hover px-4 py-3 text-sm">
      <p className="font-medium text-mi-text">{d.label} €/mq</p>
      <p className="text-mi-muted mt-0.5">
        <span className="text-mi-text font-semibold">{d.count.toLocaleString("it-IT")}</span>{" "}transazioni
      </p>
    </div>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-5 h-[2px] shrink-0"
        style={dashed
          ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0, ${color} 4px, transparent 4px, transparent 7px)` }
          : { backgroundColor: color }}
      />
      <span className="text-[12px] text-mi-muted">{label}</span>
    </div>
  );
}

function PageHeader({ loading }: { loading?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1.5">
        <BarChart2 size={20} strokeWidth={1.5} className="text-mi-primary" />
        <h1 className="text-[22px] font-semibold text-mi-text tracking-[-0.02em]">Distribuzione prezzi zona</h1>
      </div>
      <p className="text-sm text-mi-muted">
        {loading ? "Caricamento dati in corso…" : "Distribuzione €/mq delle transazioni in una zona OMI, con percentili evidenziati."}
      </p>
    </div>
  );
}

export default function DistribuzioneContent() {
  const [raw, setRaw]         = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zonaFiltro, setZonaFiltro] = useState("C16");
  const [targetInput, setTargetInput] = useState("");

  useEffect(() => {
    fetchAllPages<RawRow>("transazioni", "attoid,metratura,prezzo,zonaOMI")
      .then(({ data, error }) => {
        if (error) setErrorMsg(error);
        else setRaw(data);
        setLoading(false);
      });
  }, []);

  const zoneDisponibili = useMemo(() => buildZoneList(raw), [raw]);

  const target = useMemo(() => {
    const v = parseInt(targetInput.replace(/\D/g, ""), 10);
    return isNaN(v) || v <= 0 ? null : v;
  }, [targetInput]);

  const { buckets, p10, p50, p90, outlierCount, sorted, domainX, bucketPiuFrequente } =
    useMemo(() => {
      const vals: number[] = [];
      let outlierCount = 0;
      for (const r of raw) {
        if (r.zonaOMI !== zonaFiltro) continue;
        const mq = parseMq(r.metratura);
        if (!mq || mq <= 0) continue;
        const eurMq = calcolaEuroMq(r.prezzo, mq);
        if (eurMq < 500 || eurMq > 10000) { outlierCount++; continue; }
        vals.push(eurMq);
      }
      if (vals.length === 0) return { buckets: [], p10: 0, p50: 0, p90: 0, outlierCount, sorted: [], domainX: [0, 1] as [number, number], bucketPiuFrequente: null };

      const sorted = [...vals].sort((a, b) => a - b);
      const p10 = Math.round(calcPercentile(sorted, 10));
      const p50 = Math.round(calcPercentile(sorted, 50));
      const p90 = Math.round(calcPercentile(sorted, 90));
      const { buckets, minBucket, maxBucket } = buildBuckets(vals);
      const domainX: [number, number] = [minBucket - BUCKET_SIZE / 2, maxBucket + BUCKET_SIZE / 2];
      const bucketPiuFrequente = buckets.reduce((best, b) => b.count > best.count ? b : best, buckets[0]);
      return { buckets, p10, p50, p90, outlierCount, sorted, domainX, bucketPiuFrequente };
    }, [raw, zonaFiltro]);

  const spiegazione = useMemo(() => {
    if (sorted.length < 5 || !bucketPiuFrequente) return null;
    let testo = `In zona ${zonaFiltro} il prezzo più frequente è tra ${bucketPiuFrequente.label} €/mq. `;
    testo += `Il 10% delle transazioni è stato chiuso sotto ${p10.toLocaleString("it-IT")} €/mq — sotto questa soglia sono veri affari. `;
    testo += `La mediana è ${p50.toLocaleString("it-IT")} €/mq. `;
    if (target !== null) {
      const rank  = sorted.filter(v => v <= target).length;
      const pRank = Math.round((rank / sorted.length) * 100);
      if (target < p10) {
        testo += `Ti chiedono ${target.toLocaleString("it-IT")} €/mq: sei sotto il 10° percentile — prezzo eccellente, verifica che non ci siano problemi strutturali.`;
      } else if (target <= p50) {
        testo += `Ti chiedono ${target.toLocaleString("it-IT")} €/mq: sei nella fascia bassa, sotto il ${pRank}% delle compravendite della zona. Prezzo interessante.`;
      } else if (target <= p90) {
        testo += `Ti chiedono ${target.toLocaleString("it-IT")} €/mq: sei nella fascia alta, sopra il ${pRank}% delle compravendite della zona.`;
      } else {
        testo += `Ti chiedono ${target.toLocaleString("it-IT")} €/mq: sei sopra il 90° percentile — stai pagando un premio significativo rispetto al mercato.`;
      }
    }
    return testo;
  }, [sorted, zonaFiltro, p10, p50, p90, target, bucketPiuFrequente]);

  if (loading)  return <div className="p-4 md:p-8 max-w-[1100px] mx-auto"><PageHeader loading /></div>;
  if (errorMsg) return (
    <div className="p-4 md:p-8 max-w-[1100px] mx-auto">
      <PageHeader />
      <div className="mt-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">Errore: {errorMsg}</div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-[1100px] mx-auto space-y-6">
      <PageHeader />

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2.5">
          <label className="text-sm font-medium text-mi-muted whitespace-nowrap">Zona OMI</label>
          <select value={zonaFiltro} onChange={e => setZonaFiltro(e.target.value)}
            className="h-9 px-3 pr-8 rounded-lg border border-mi-border bg-mi-card text-sm font-medium text-mi-text appearance-none focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors cursor-pointer"
            style={SELECT_STYLE}>
            {zoneDisponibili.map(z => <option key={z} value={z}>{getZonaLabel(z)}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="text-sm font-medium text-mi-muted whitespace-nowrap">Prezzo target</label>
          <div className="relative">
            <input type="text" inputMode="numeric" value={targetInput} onChange={e => setTargetInput(e.target.value)}
              placeholder="es. 3200"
              className="h-9 w-32 pl-3 pr-10 rounded-lg border border-mi-border bg-mi-card text-sm font-medium text-mi-text placeholder:text-mi-subtle focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary transition-colors" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-mi-subtle pointer-events-none">€/mq</span>
          </div>
        </div>

        <span className="text-sm text-mi-subtle ml-auto">{sorted.length.toLocaleString("it-IT")} transazioni</span>
      </div>

      {/* ── Chart ── */}
      {buckets.length > 0 ? (
        <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
          <div className="flex flex-wrap items-center gap-5 mb-5">
            <LegendItem color="#22C55E" label={`P10 — soglia affare (${p10.toLocaleString("it-IT")} €/mq)`} />
            <LegendItem color="#D4A055" label={`Mediana (${p50.toLocaleString("it-IT")} €/mq)`} />
            <LegendItem color="#B84C2E" label={`P90 — soglia premium (${p90.toLocaleString("it-IT")} €/mq)`} />
            {target !== null && <LegendItem color="#1C1917" dashed label={`Il tuo target (${target.toLocaleString("it-IT")} €/mq)`} />}
          </div>

          <div className="h-[260px] md:h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 24, right: 20, bottom: 36, left: 16 }}
                barSize={Math.max(4, Math.min(18, Math.floor(700 / buckets.length) - 2))}>
                <CartesianGrid strokeDasharray="0" stroke="#F0F0F0" vertical={false} />
                <ReferenceArea x1={domainX[0]} x2={p10}        fill="#22C55E" fillOpacity={0.08} />
                <ReferenceArea x1={p10}        x2={p50}        fill="#D4A055" fillOpacity={0.08} />
                <ReferenceArea x1={p50}        x2={p90}        fill="#F97316" fillOpacity={0.08} />
                <ReferenceArea x1={p90}        x2={domainX[1]} fill="#B84C2E" fillOpacity={0.08} />
                <XAxis dataKey="x" type="number" domain={domainX} scale="linear"
                  tick={{ fontSize: 11, fill: "#9E9E9E" }} tickLine={false} axisLine={{ stroke: "#EBEBEB" }}
                  tickFormatter={v => `${(v / 1000).toFixed(1)}k`}
                  label={{ value: "€/mq", position: "insideBottomRight", offset: -4, style: { fontSize: 11, fill: "#9E9E9E" } }} />
                <YAxis tick={{ fontSize: 11, fill: "#9E9E9E" }} tickLine={false} axisLine={false} width={40}
                  label={{ value: "transazioni", angle: -90, position: "insideLeft", offset: 12, style: { fontSize: 11, fill: "#9E9E9E" } }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(184,76,46,0.04)" }} />
                <Bar dataKey="count" fill="#B84C2E" fillOpacity={0.65} radius={[3,3,0,0]} isAnimationActive={false} />
                <ReferenceLine x={p10} stroke="#22C55E" strokeWidth={1.5} label={{ value: "P10", position: "insideTopRight", fontSize: 11, fill: "#22C55E", fontWeight: 600 }} />
                <ReferenceLine x={p50} stroke="#D4A055" strokeWidth={1.5} label={{ value: "Med", position: "insideTopRight", fontSize: 11, fill: "#D4A055", fontWeight: 600 }} />
                <ReferenceLine x={p90} stroke="#B84C2E" strokeWidth={1.5} label={{ value: "P90", position: "insideTopRight", fontSize: 11, fill: "#B84C2E", fontWeight: 600 }} />
                {target !== null && <ReferenceLine x={target} stroke="#1C1917" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: "Target", position: "insideTopLeft", fontSize: 11, fill: "#1C1917", fontWeight: 600 }} />}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between mt-3 px-1 text-[11px] text-mi-subtle">
            <span className="text-green-600">◀ affari rari</span>
            <span className="text-amber-500">sotto la media</span>
            <span className="text-orange-500">sopra la media</span>
            <span className="text-mi-primary">premium ▶</span>
          </div>
        </div>
      ) : (
        <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-12 text-center">
          <p className="text-sm text-mi-subtle">Nessun dato disponibile per questa zona.</p>
        </div>
      )}

      <p className="text-[12px] text-mi-subtle">
        * I bucket sono fasce di 200 €/mq. Le linee verticali indicano i percentili calcolati sull&apos;intera distribuzione della zona.
      </p>

      {spiegazione && <AnalysisCard text={spiegazione} />}

      <OutlierWarning count={outlierCount} />
    </div>
  );
}
