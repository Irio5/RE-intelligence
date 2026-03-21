"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Map as MapIcon } from "lucide-react";
import { parseMq, calcolaEuroMq } from "@/lib/utils/metratura";
import { getZonaLabel } from "@/lib/data/zoneOMI";
import { supabase } from "@/lib/supabase";
import type { ZoneStat } from "./MappaLeaflet";

// ── Dynamic import — no SSR ───────────────────────────────────────────────────

const MappaLeaflet = dynamic(() => import("./MappaLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] md:h-[540px] rounded-2xl bg-mi-hover flex items-center justify-center">
      <p className="text-sm text-mi-subtle animate-pulse">Caricamento mappa…</p>
    </div>
  ),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type RawRow = {
  metratura: string;
  prezzo:    number;
  zonaOMI:   string;
  cat:       string;
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmt(n: number) { return Math.round(n).toLocaleString("it-IT"); }

// ── Main component ────────────────────────────────────────────────────────────

export default function MappaContent() {
  const [raw, setRaw]               = useState<RawRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [geojson, setGeojson]       = useState<GeoJSON.FeatureCollection | null>(null);
  const [geojsonErr, setGeojsonErr] = useState(false);
  const [selectedZona, setSelectedZona] = useState<string | null>(null);

  // ── Fetch transactions ──────────────────────────────────────────────────────
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

  // ── Fetch GeoJSON ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/data/zone-omi-milano.geojson")
      .then(r => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(data => setGeojson(data))
      .catch(() => setGeojsonErr(true));
  }, []);

  // ── Compute zone stats ──────────────────────────────────────────────────────
  const zoneStats = useMemo<Record<string, ZoneStat>>(() => {
    const acc: Record<string, { sum: number; count: number; cats: Record<string, number> }> = {};
    for (const r of raw) {
      const mq = parseMq(r.metratura);
      if (!mq || mq <= 0) continue;
      const eurMq = calcolaEuroMq(r.prezzo, mq);
      if (eurMq < 500 || eurMq > 10000) continue;
      const z = r.zonaOMI;
      if (!acc[z]) acc[z] = { sum: 0, count: 0, cats: {} };
      acc[z].sum   += eurMq;
      acc[z].count += 1;
      acc[z].cats[r.cat] = (acc[z].cats[r.cat] ?? 0) + 1;
    }
    const result: Record<string, ZoneStat> = {};
    for (const [zona, { sum, count, cats }] of Object.entries(acc)) {
      if (count < 3) continue;
      const catPrev = Object.entries(cats).sort(([,a],[,b]) => b - a)[0]?.[0] ?? "—";
      result[zona] = { mean: sum / count, count, catPrev };
    }
    return result;
  }, [raw]);

  // ── Città stats ─────────────────────────────────────────────────────────────
  const cityStats = useMemo(() => {
    const vals = Object.values(zoneStats);
    if (vals.length === 0) return null;
    const cityMean = vals.reduce((s, v) => s + v.mean, 0) / vals.length;
    const sorted   = [...vals].sort((a, b) => a.mean - b.mean);
    const cheapest = Object.entries(zoneStats).sort(([,a],[,b]) => a.mean - b.mean).slice(0, 3);
    const priciest = Object.entries(zoneStats).sort(([,a],[,b]) => b.mean - a.mean).slice(0, 3);
    return { cityMean, sorted, cheapest, priciest };
  }, [zoneStats]);

  // ── Explanation ─────────────────────────────────────────────────────────────
  const spiegazione = useMemo(() => {
    if (!cityStats) return null;

    if (selectedZona && zoneStats[selectedZona]) {
      const s    = zoneStats[selectedZona];
      const diff = Math.round(((s.mean - cityStats.cityMean) / cityStats.cityMean) * 100);
      const pos  = diff > 0
        ? `il ${Math.abs(diff)}% sopra la media città`
        : diff < 0
          ? `il ${Math.abs(diff)}% sotto la media città`
          : "in linea con la media città";
      return `Zona ${getZonaLabel(selectedZona)}: prezzo medio ${fmt(s.mean)} €/mq, ${pos} (media Milano: ${fmt(cityStats.cityMean)} €/mq). Basato su ${s.count} transazioni. Categoria catastale prevalente: ${s.catPrev}.`;
    }

    const cheapNames = cityStats.cheapest.map(([z]) => z).join(", ");
    const priceyNames = cityStats.priciest.map(([z]) => z).join(", ");
    return `Milano ha un prezzo medio di ${fmt(cityStats.cityMean)} €/mq su ${Object.values(zoneStats).reduce((s,v) => s + v.count, 0).toLocaleString("it-IT")} transazioni. Le zone più care sono ${priceyNames} (oltre ${fmt(cityStats.priciest[0][1].mean)} €/mq). Le più accessibili sono ${cheapNames} (sotto ${fmt(cityStats.cheapest[2][1].mean)} €/mq). Clicca su una zona per i dettagli.`;
  }, [selectedZona, zoneStats, cityStats]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-8 max-w-[1100px] mx-auto space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1.5">
          <MapIcon size={20} strokeWidth={1.5} className="text-mi-primary" />
          <h1 className="text-[22px] font-semibold text-mi-text tracking-[-0.02em]">
            Mappa prezzi per zona OMI
          </h1>
        </div>
        <p className="text-sm text-mi-muted">
          {loading
            ? "Caricamento dati in corso…"
            : `Mappa interattiva · ${Object.keys(zoneStats).length} zone · ${Object.values(zoneStats).reduce((s,v) => s + v.count, 0).toLocaleString("it-IT")} transazioni`}
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">Errore: {errorMsg}</div>
      )}

      {/* Map card */}
      <div className="bg-mi-card rounded-2xl border border-mi-border shadow-card p-4">
        {loading ? (
          <div className="h-[350px] md:h-[540px] rounded-xl bg-mi-hover flex items-center justify-center">
            <p className="text-sm text-mi-subtle animate-pulse">Caricamento dati…</p>
          </div>
        ) : (
          <>
            {geojsonErr && (
              <div className="mb-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-700">
                GeoJSON zone OMI non disponibile — i poligoni non verranno mostrati.
              </div>
            )}
            <MappaLeaflet
              zoneStats={zoneStats}
              geojson={geojson}
              onZoneClick={setSelectedZona}
            />
          </>
        )}
      </div>

      {/* Explanation */}
      {spiegazione && (
        <div className="bg-mi-card border border-mi-border rounded-2xl p-6 shadow-card">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-mi-subtle mb-2">
            {selectedZona ? `Zona selezionata · ${selectedZona}` : "Panoramica Milano"}
          </p>
          <p className="text-sm text-mi-muted leading-relaxed">{spiegazione}</p>
          {selectedZona && (
            <button
              onClick={() => setSelectedZona(null)}
              className="mt-3 text-[12px] text-mi-primary hover:underline"
            >
              ← Torna alla panoramica
            </button>
          )}
        </div>
      )}
    </div>
  );
}
