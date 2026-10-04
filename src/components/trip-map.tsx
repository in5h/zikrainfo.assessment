"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import type { DayCheck } from "@/lib/agent/itinerary";

import { DAY_COLORS } from "./day-colors";

function pin(n: number, color: string, faded: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:${color};color:white;font:600 12px/28px system-ui;text-align:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);opacity:${faded ? 0.35 : 1}">${n}</div>`,
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36] });
  }, [map, points]);
  return null;
}

export default function TripMap({
  center,
  days,
  activeDay,
}: {
  center: [number, number];
  days: DayCheck[];
  activeDay: number | null;
}) {
  const visible = activeDay == null ? days : days.filter((_, i) => i === activeDay);
  const points = visible.flatMap((d) => d.timeline.map((t) => [t.lat, t.lng] as [number, number]));

  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      {days.map((d, di) => {
        const faded = activeDay != null && activeDay !== di;
        const color = DAY_COLORS[di % DAY_COLORS.length];
        return (
          <span key={d.date}>
            <Polyline
              positions={d.timeline.map((t) => [t.lat, t.lng])}
              pathOptions={{ color, weight: 3, opacity: faded ? 0.15 : 0.7, dashArray: "6 6" }}
            />
            {d.timeline.map((t, i) => (
              <Marker key={`${d.date}-${t.place_id}`} position={[t.lat, t.lng]} icon={pin(i + 1, color, faded)} zIndexOffset={faded ? 0 : 1000}>
                <Tooltip direction="top" offset={[0, -12]}>
                  <b>
                    Day {di + 1} · {t.start}
                  </b>
                  <br />
                  {t.name}
                </Tooltip>
              </Marker>
            ))}
          </span>
        );
      })}
      <FitBounds points={points.length ? points : [center]} />
    </MapContainer>
  );
}
