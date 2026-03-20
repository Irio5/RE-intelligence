"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { parseMq, isStimato, calcolaEuroMq } from "@/lib/utils/metratura";
import { getZonaLabel, getAllZoneCodes } from "@/lib/data/zoneOMI";
import { supabase } from "@/lib/supabase";

const MESI = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];

function xToLabel(x: number): string {
  const d = new Date(x);
  return `${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

type RawRow = {
  attoid: string;
  anno: number;
  mese: number;
  metratura: string;
  prezzo: number;
  zonaOMI: string;
};

type Point = { x: number; y: number };

function computeTrend(points: Point[]): Point[] {
  const grouped = new Map<number, number[]>();
  for (const p of points) {
    const d = new Date(p.x);
    const key = d.getFullYear() * 100 + (d.getMonth() + 1);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p.y);
  }

  const monthly = Array.from(grouped.keys())
    .sort((a, b) => a - b)
    .map((key) => {
      const anno = Math.floor(key / 100);
      const mese = key % 100;
      const x = new Date(anno, mese - 1).getTime();
      const vals = [...grouped.get(key)!].sort((a, b) => a - b);
      const mid = Math.floor(vals.length / 2);
      const median =
        vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
      return { x, y: Math.round(median) };
    });

  return monthly.map((p, i) => {
    const slice = monthly.slice(Math.max(0, i - 1), i + 2);
    const avg = slice.reduce((s, t) => s + t.y, 0) / slice.length;
    return { x: p.x, y: Math.round(avg) };
  });
}

const ZONE_ORDINATE = getAllZoneCodes();

export default function TrendContent() {
  const [raw, setRaw] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zonaFiltro, setZonaFiltro] = useState("C16");

  useEffect(() => {
    async function fetchAll() {
      const PAGE = 1000;
      let all: RawRow[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("transazioni")
          .select("attoid,anno,mese,metratura,prezzo,zonaOMI")
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) { setErrorMsg(error.message); setLoading(false); return; }
        if (!data || data.length === 0) break;
        all = all.concat(data as RawRow[]);
        if (data.length < PAGE) break;
        page++;
      }
      const anniUnici = Array.from(new Set(all.map((r) => Number(r.anno)))).sort();
      console.log("[trend] anni unici nel DB:", anniUnici);
      setRaw(all);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const zoneDisponibili = useMemo(() => {
    const dalDB = new Set(raw.map((r) => r.zonaOMI));
    return Array.from(new Set([...ZONE_ORDINATE, ...dalDB])).sort();
  }, [raw]);

  const { pointsReali, pointsStimati, trend, outlierCount, domainX } = useMemo(() => {
    const filtrati = raw.filter((r) => r.zonaOMI === zonaFiltro);
    const reali: Point[] = [];
    const stimati: Point[] = [];
    let outlierCount = 0;
    const JITTER_MS = 10 * 24 * 60 * 60 * 1000;

    for (const r of filtrati) {
      const mq = parseMq(r.metratura);
      if (!mq || mq <= 0) continue;
      const eurMq = calcolaEuroMq(r.prezzo, mq);
      if (eurMq < 500 || eurMq > 10000) { outlierCount++; continue; }
      const anno = Number(r.anno);
      const mese = Number(r.mese);
      const baseX = new Date(anno, mese - 1).getTime();
      const jitter = (Math.random() - 0.5) * 2 * JITTER_MS;
      const point: Point = { x: baseX + jitter, y: eurMq };
      if (isStimato(r.metratura)) stimati.push(point);
      else reali.push(point);
    }

    const allPoints = [...reali, ...stimati];
    let minX = Infinity, maxX = -Infinity;
    for (const p of allPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
    const domainX: [number, number] = allPoints.length > 0 ? [minX, maxX] : [0, 1];

    return { pointsReali: reali, pointsStimati: stimati, trend: computeTrend(allPoints), outlierCount, domainX };
  }, [raw, zonaFiltro]);

  const spiegazione = useMemo(() => {
    if (trend.length < 4) return null;
    const first = trend[0];
    const last = trend[trend.length - 1];
    const anniTotali = Math.round((last.x - first.x) / (1000 * 60 * 60 * 24 * 365));
    const pct = Math.round(((last.y - first.y) / first.y) * 100);
    const annuo = anniTotali > 0 ? (pct / anniTotali).toFixed(1) : "0";
    const recenti = trend.slice(-6);
    const pctRecente = recenti.length >= 2
      ? Math.round(((recenti[recenti.length - 1].y - recenti[0].y) / recenti[0].y) * 100)
      : 0;
    const annoInizio = new Date(first.x).getFullYear();
    const annoFine = new Date(last.x).getFullYear();

    let testo = `In zona ${zonaFiltro} il prezzo medio €/mq è passato da ${first.y.toLocaleString("it-IT")} nel ${annoInizio} a ${last.y.toLocaleString("it-IT")} nel ${annoFine}`;
    testo += pct >= 0
      ? `, una crescita del ${pct}% in ${anniTotali} anni (+${annuo}% annuo).`
      : `, un calo del ${Math.abs(pct)}% in ${anniTotali} anni (${annuo}% annuo).`;
    if (pctRecente > 2) testo += ` Negli ultimi 6 mesi il trend è in accelerazione (+${pctRecente}%).`;
    else if (pctRecente < -2) testo += ` Negli ultimi 6 mesi il trend è in discesa (${pctRecente}%).`;
    else testo += ` Negli ultimi 6 mesi il trend si è stabilizzato.`;
    return testo;
  }, [trend, zonaFiltro]);

  const totale = pointsReali.length + pointsStimati.length;

  // --- Render states ---

  if (loading) {
    return (
      <div className="p-8 max-w-[1100px] mx-auto">
        <PageHeader loading />
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="p-8 max-w-[1100px] mx-auto">
        <PageHeader />
        <div className="mt-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          Errore: {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1100px] mx-auto space-y-6">
      <PageHeader />

      {/* Filter row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <label className="text-sm font-medium text-mi-muted whitespace-nowrap">
            Zona OMI
          </label>
          <select
            value={zonaFiltro}
            onChange={(e) => setZonaFiltro(e.target.value)}
            className="h-9 px-3 pr-8 rounded-lg border border-mi-border bg-mi-card text-sm font-medium text-mi-text appearance-none
                       focus:outline-none focus:ring-2 focus:ring-mi-primary/20 focus:border-mi-primary
                       transition-colors duration-150 cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236F6F6F' stroke-width='1.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
          >
            {zoneDisponibili.map((z) => (
              <option key={z} value={z}>{getZonaLabel(z)}</option>
            ))}
          </select>
        </div>

        <span className="text-sm text-mi-subtle">
          {totale.toLocaleString("it-IT")} transazioni
        </span>
      </div>

      {/* Chart card */}
      <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-6">
        <ResponsiveContainer width="100%" height={420}>
          <ComposedChart margin={{ top: 8, right: 16, bottom: 32, left: 56 }}>
            <CartesianGrid
              strokeDasharray="0"
              stroke="#F0F0F0"
              vertical={false}
            />
            <XAxis
              type="number"
              dataKey="x"
              scale="time"
              domain={domainX}
              tick={{ fontSize: 12, fill: "#9E9E9E", fontWeight: 400 }}
              tickLine={false}
              axisLine={{ stroke: "#EBEBEB" }}
              tickFormatter={(v) => {
                const d = new Date(v);
                if (d.getMonth() === 0) return String(d.getFullYear());
                if (d.getMonth() === 6) return `lug ${d.getFullYear()}`;
                return "";
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              tick={{ fontSize: 12, fill: "#9E9E9E", fontWeight: 400 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              label={{
                value: "€/mq",
                angle: -90,
                position: "insideLeft",
                offset: -40,
                style: { fontSize: 12, fill: "#9E9E9E" },
              }}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const d = payload[0].payload as Point;
                return (
                  <div className="bg-white border border-mi-border rounded-xl shadow-card-hover px-4 py-3 text-sm">
                    <p className="font-medium text-mi-text">{xToLabel(d.x)}</p>
                    <p className="text-mi-muted mt-0.5">
                      <span className="text-mi-text font-semibold">
                        {d.y.toLocaleString("it-IT")}
                      </span>{" "}
                      €/mq
                    </p>
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ fontSize: 12, color: "#9E9E9E", paddingBottom: 16 }}
              iconType="circle"
              iconSize={8}
            />

            <Scatter
              name="mq reali"
              data={pointsReali}
              fill="#4A7C9E"
              fillOpacity={0.3}
              r={2.5}
              isAnimationActive={false}
            />
            <Scatter
              name="mq stimati (da vani)"
              data={pointsStimati}
              fill="#D4A055"
              fillOpacity={0.3}
              r={2.5}
              isAnimationActive={false}
            />
            <Line
              data={trend}
              dataKey="y"
              type="monotone"
              stroke="#C05A35"
              strokeWidth={2}
              dot={false}
              name="media mobile"
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        {outlierCount > 0 && (
          <div className="flex items-start gap-2.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" />
            <span>
              <strong>{outlierCount.toLocaleString("it-IT")}</strong> transazioni escluse
              come outlier (€/mq &lt; 500 o &gt; 10.000 — probabili errori nei dati).
            </span>
          </div>
        )}
        <p className="text-[12px] text-mi-subtle">
          * Punti ambra = metratura stimata (1 vano = 20 mq). La linea rossa mostra la media mobile mensile.
        </p>
      </div>

      {/* Explanatory text */}
      {spiegazione && (
        <div className="bg-mi-card border border-mi-border rounded-2xl p-6 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-2">
            Analisi
          </p>
          <p className="text-sm text-mi-muted leading-relaxed">{spiegazione}</p>
        </div>
      )}
    </div>
  );
}

// Page header component
function PageHeader({ loading }: { loading?: boolean }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="flex items-center gap-2.5 mb-1.5">
          <TrendingUp size={20} strokeWidth={1.5} className="text-mi-primary" />
          <h1 className="text-[22px] font-semibold text-mi-text tracking-[-0.02em]">
            Trend €/mq nel tempo
          </h1>
        </div>
        <p className="text-sm text-mi-muted">
          {loading
            ? "Caricamento dati in corso…"
            : "Andamento del prezzo medio per metro quadro nelle zone OMI di Milano."}
        </p>
      </div>
    </div>
  );
}
