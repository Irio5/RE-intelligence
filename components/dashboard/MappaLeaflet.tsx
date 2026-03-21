"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getZonaLabel } from "@/lib/data/zoneOMI";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ZoneStat = {
  mean:    number;
  count:   number;
  catPrev: string;
};

type Props = {
  zoneStats:    Record<string, ZoneStat>;
  geojson:      GeoJSON.FeatureCollection | null;
  onZoneClick:  (zona: string | null) => void;
};

// ── Color scale green → amber → terracotta ────────────────────────────────────

function getColor(value: number, min: number, max: number): string {
  const t = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (t < 0.5) {
    const s = t * 2;
    return `rgb(${lerp(0x22, 0xD4, s)},${lerp(0xC5, 0xA0, s)},${lerp(0x5E, 0x55, s)})`;
  }
  const s = (t - 0.5) * 2;
  return `rgb(${lerp(0xD4, 0xB8, s)},${lerp(0xA0, 0x4C, s)},${lerp(0x55, 0x2E, s)})`;
}

function lerp(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }

// ── Component ─────────────────────────────────────────────────────────────────

export default function MappaLeaflet({ zoneStats, geojson, onZoneClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);

  const values = Object.values(zoneStats).map(s => s.mean);
  const minVal = values.length ? Math.min(...values) : 0;
  const maxVal = values.length ? Math.max(...values) : 10000;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // ── Init map ──────────────────────────────────────────────────────────────
    const map = L.map(containerRef.current, {
      center: [45.4642, 9.19],
      zoom: 12,
    });
    mapRef.current = map;

    // CartoDB Positron — light/desaturated tiles
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap contributors © CARTO",
      maxZoom: 19,
    }).addTo(map);

    // ── GeoJSON polygons ──────────────────────────────────────────────────────
    if (geojson) {
      L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
        style: (feature) => {
          const zona = feature?.properties?.Zona
            ?? feature?.properties?.zona
            ?? feature?.properties?.COD_ZONA
            ?? feature?.properties?.ZONA;
          const stat  = zona ? zoneStats[zona] : undefined;
          return {
            fillColor:   stat ? getColor(stat.mean, minVal, maxVal) : "#CCCCCC",
            fillOpacity: 0.60,
            color:       "#555",
            weight:      1,
          };
        },
        onEachFeature: (feature, layer) => {
          const zona = feature?.properties?.Zona
            ?? feature?.properties?.zona
            ?? feature?.properties?.COD_ZONA
            ?? feature?.properties?.ZONA;
          const stat = zona ? zoneStats[zona] : undefined;

          layer.on({
            mouseover: (e) => {
              (e.target as L.Path).setStyle({ fillOpacity: 0.85, weight: 2, color: "#333" });
            },
            mouseout: (e) => {
              (e.target as L.Path).setStyle({ fillOpacity: 0.60, weight: 1, color: "#555" });
            },
            click: () => {
              onZoneClick(zona ?? null);
              if (stat && zona) {
                const label = getZonaLabel(zona);
                layer.bindPopup(`
                  <div style="font-family:system-ui,sans-serif;min-width:170px">
                    <p style="font-weight:700;font-size:13px;margin:0 0 6px;color:#1C1917">${label}</p>
                    <p style="font-size:12px;margin:2px 0;color:#4A4A48">
                      <b style="color:#1C1917">${Math.round(stat.mean).toLocaleString("it-IT")} €/mq</b> medio
                    </p>
                    <p style="font-size:12px;margin:2px 0;color:#4A4A48">${stat.count} transazioni</p>
                    <p style="font-size:12px;margin:2px 0;color:#4A4A48">Cat. prevalente: ${stat.catPrev}</p>
                  </div>
                `).openPopup();
              }
            },
          });
        },
      }).addTo(map);
    }

    return () => { map.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-[350px] md:h-[540px]">
      <div ref={containerRef} style={{ height: "100%", width: "100%", borderRadius: 16, overflow: "hidden" }} />

      {/* ── Legend ── */}
      <div style={{
        position: "absolute", bottom: 28, right: 12, zIndex: 1000,
        background: "white", border: "1px solid #E5E5E5",
        borderRadius: 12, padding: "10px 14px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
      }}>
        <p style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, color: "#1C1917" }}>€/mq medio</p>
        <div style={{
          width: 130, height: 10, borderRadius: 4,
          background: "linear-gradient(to right, #22C55E, #D4A055, #B84C2E)",
          marginBottom: 5,
        }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6F6F6F" }}>
          <span>{Math.round(minVal).toLocaleString("it-IT")}</span>
          <span>{Math.round(maxVal).toLocaleString("it-IT")}</span>
        </div>
      </div>
    </div>
  );
}
