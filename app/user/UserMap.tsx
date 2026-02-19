"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminMap from "../admin/AdminMap";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

const WARNING_DISTANCE_METERS = 5000;
const REPORT_DISTANCE_METERS = 250;
const REPORT_COOLDOWN_MS = 10 * 60 * 1000;
const ZONES_REFRESH_MS = 60 * 1000;
const HEAT_REFRESH_MS = 60 * 1000;
const PING_INTERVAL_MS = 20000;
const PING_TIMEOUT_MS = 4000;
const EARTH_RADIUS_METERS = 6371000;

type Position = { lat: number; lng: number };
type HeatPoint = { lat: number; lng: number; intensity: number };

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceMeters = (a: Position, b: Position) => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const toXYMeters = (lng: number, lat: number, lat0: number) => {
  const latRad = toRadians(lat);
  const lngRad = toRadians(lng);
  const lat0Rad = toRadians(lat0);
  return {
    x: EARTH_RADIUS_METERS * lngRad * Math.cos(lat0Rad),
    y: EARTH_RADIUS_METERS * latRad,
  };
};

const distancePointToSegmentMeters = (point: Position, a: number[], b: number[]) => {
  const p = toXYMeters(point.lng, point.lat, point.lat);
  const v = toXYMeters(a[0], a[1], point.lat);
  const w = toXYMeters(b[0], b[1], point.lat);
  const dx = w.x - v.x;
  const dy = w.y - v.y;
  const denom = dx * dx + dy * dy || 1;
  const t = ((p.x - v.x) * dx + (p.y - v.y) * dy) / denom;
  const clamped = Math.max(0, Math.min(1, t));
  const projX = v.x + clamped * dx;
  const projY = v.y + clamped * dy;
  return Math.hypot(p.x - projX, p.y - projY);
};

const pointInRing = (point: Position, ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const pointInPolygon = (point: Position, polygon: number[][][]) => {
  if (!polygon.length || !pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
};

const minDistanceToPolygonMeters = (point: Position, polygon: number[][][]) => {
  if (pointInPolygon(point, polygon)) return 0;
  let min = Infinity;
  polygon.forEach((ring) => {
    const len = ring.length;
    if (len < 2) return;
    for (let i = 0; i < len; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % len];
      min = Math.min(min, distancePointToSegmentMeters(point, a, b));
    }
  });
  return min;
};

  const minDistanceToFeatureMeters = (point: Position, feature: any) => {
  if (!feature?.geometry) return Infinity;
  const { type, coordinates } = feature.geometry;
  if (type === "Polygon") return minDistanceToPolygonMeters(point, coordinates);
  if (type === "MultiPolygon") {
    return coordinates.reduce((acc: number, poly: number[][][]) => {
      return Math.min(acc, minDistanceToPolygonMeters(point, poly));
    }, Infinity);
  }
  return Infinity;
};

const minDistanceToHeatPointsMeters = (point: Position, points: HeatPoint[]) => {
  if (!points.length) return Infinity;
  let min = Infinity;
  for (const p of points) {
    const d = distanceMeters(point, { lat: p.lat, lng: p.lng });
    if (d < min) min = d;
  }
  return min;
};

const heatSeverityFromPoint = (point: HeatPoint) => (point.intensity >= 0.85 ? "none" : "weak");

type AssignedWorker = {
  id: number;
  first_name: string;
  last_name: string;
  status?: string;
  service_type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type UserMapProps = {
  assignedWorker?: AssignedWorker | null;
  onUserPositionChange?: (position: Position) => void;
};

export default function UserMap({ assignedWorker, onUserPositionChange }: UserMapProps) {
  const [zones, setZones] = useState<any | null>(null);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [warning, setWarning] = useState<{
    severity: "weak" | "none";
    name?: string;
    distanceMeters: number;
  } | null>(null);
  const lastReportRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const failuresRef = useRef(0);
  const lastPingRef = useRef(0);

  const fetchZones = useCallback(() => {
    fetch("/api/connectivity-zones")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setZones(data))
      .catch(() => setZones(null));
  }, []);

  const fetchHeat = useCallback(() => {
    fetch("/api/connectivity-heat")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setHeatPoints(Array.isArray(data?.points) ? data.points : []))
      .catch(() => setHeatPoints([]));
  }, []);

  useEffect(() => {
    fetchZones();
    const interval = setInterval(fetchZones, ZONES_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchZones]);

  useEffect(() => {
    fetchHeat();
    const interval = setInterval(fetchHeat, HEAT_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchHeat]);

  const geoJsonOverlays = useMemo(() => {
    const overlays: Array<{ data: any; style?: any }> = [];
    if (zones) {
      overlays.push({
        data: zones,
        style: (feature: any) => {
          const severity = feature?.properties?.severity;
          if (severity === "none") {
            return {
              color: "rgba(239, 68, 68, 0.8)",
              fillColor: "rgba(239, 68, 68, 0.2)",
              weight: 2,
              fillOpacity: 0.3,
            };
          }
          return {
            color: "rgba(245, 158, 11, 0.8)",
            fillColor: "rgba(245, 158, 11, 0.18)",
            weight: 2,
            fillOpacity: 0.25,
          };
        },
      });
    }
    return overlays;
  }, [zones]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now();
      if (now - lastPingRef.current < PING_INTERVAL_MS) return;
      lastPingRef.current = now;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      try {
        const res = await fetch("/api/ping", { signal: controller.signal, cache: "no-store" });
        if (!res.ok) failuresRef.current += 1;
      } catch {
        failuresRef.current += 1;
      } finally {
        clearTimeout(timeout);
      }
    }, PING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const handlePositionChange = useCallback((position: Position) => {
    onUserPositionChange?.(position);
    const features = zones?.features;
    let warningSet = false;

    if (position && Array.isArray(features) && features.length > 0) {
      let closest: { feature: any; distance: number } | null = null;
      for (const feature of features) {
        const distance = minDistanceToFeatureMeters(position, feature);
        if (!Number.isFinite(distance)) continue;
        if (!closest || distance < closest.distance) {
          closest = { feature, distance };
        }
      }

      if (closest && closest.distance <= WARNING_DISTANCE_METERS) {
        const severity = closest.feature?.properties?.severity === "none" ? "none" : "weak";
        setWarning({
          severity,
          name: closest.feature?.properties?.name,
          distanceMeters: closest.distance,
        });
        warningSet = true;
      }
    }

    if (!warningSet && position && heatPoints.length) {
      const minDistance = minDistanceToHeatPointsMeters(position, heatPoints);
      if (minDistance <= WARNING_DISTANCE_METERS) {
        const nearest = heatPoints.reduce((acc, p) => {
          const d = distanceMeters(position, { lat: p.lat, lng: p.lng });
          if (!acc || d < acc.d) return { p, d };
          return acc;
        }, null as null | { p: HeatPoint; d: number });

        setWarning({
          severity: nearest ? heatSeverityFromPoint(nearest.p) : "weak",
          distanceMeters: minDistance,
        });
        warningSet = true;
      }
    }

    if (!warningSet) setWarning(null);

    const connection = typeof navigator !== "undefined" ? (navigator as any).connection : null;
    const effectiveType = connection?.effectiveType || null;
    const downlink = connection?.downlink ?? null;
    const rtt = connection?.rtt ?? null;
    const offline = typeof navigator !== "undefined" ? !navigator.onLine : false;
    const failures = failuresRef.current;

    let severity: "weak" | "none" | null = null;
    if (
      offline ||
      effectiveType === "slow-2g" ||
      (typeof downlink === "number" && downlink <= 0.1) ||
      (typeof rtt === "number" && rtt >= 2000) ||
      failures >= 3
    ) {
      severity = "none";
    } else if (
      effectiveType === "2g" ||
      (typeof downlink === "number" && downlink <= 0.5) ||
      (typeof rtt === "number" && rtt >= 1000) ||
      failures >= 1
    ) {
      severity = "weak";
    }

    if (!severity) return;

    const last = lastReportRef.current;
    if (last) {
      const distance = distanceMeters(position, { lat: last.lat, lng: last.lng });
      if (distance < REPORT_DISTANCE_METERS && Date.now() - last.at < REPORT_COOLDOWN_MS) {
        return;
      }
    }

    fetch("/api/connectivity-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: position.lat,
        lng: position.lng,
        severity,
        effectiveType,
        downlink,
        rtt,
        failures,
        offline,
      }),
    }).catch(() => {
      // no-op
    });

    lastReportRef.current = { lat: position.lat, lng: position.lng, at: Date.now() };
    failuresRef.current = 0;
  }, [zones, heatPoints, onUserPositionChange]);

  const warningText = useMemo(() => {
    if (!warning) return null;
    const km = Math.max(0.1, warning.distanceMeters / 1000).toFixed(1);
    if (warning.severity === "none") {
      return `No coverage zone ahead ${warning.name ? `(${warning.name}) ` : ""}in ${km} km.`;
    }
    return `Weak connectivity zone ahead ${warning.name ? `(${warning.name}) ` : ""}in ${km} km.`;
  }, [warning]);

  return (
    <div className="user-map-live-wrap">
      <AdminMap
        popupLabel="Your location"
        mapClassName="admin-leaflet-map"
        wrapClassName="admin-leaflet-wrap"
        userMarkerType="pulsing"
        geoJsonOverlays={geoJsonOverlays}
        onPositionChange={handlePositionChange}
        watchPosition
        workers={
          assignedWorker && assignedWorker.latitude != null && assignedWorker.longitude != null
            ? [
                {
                  id: assignedWorker.id,
                  first_name: assignedWorker.first_name,
                  last_name: assignedWorker.last_name,
                  status: assignedWorker.status,
                  service_type: assignedWorker.service_type,
                  latitude: assignedWorker.latitude,
                  longitude: assignedWorker.longitude,
                },
              ]
            : []
        }
      >
        <HeatmapOverlay points={heatPoints} />
      </AdminMap>
      {warningText && (
        <div className={`user-connectivity-warning user-connectivity-warning--${warning?.severity}`}>
          <span className="user-connectivity-dot" />
          <div>
            <strong>Connectivity alert</strong>
            <span>{warningText}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function HeatmapOverlay({ points }: { points: HeatPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (!points.length) return;
    const data = points.map((p) => [p.lat, p.lng, p.intensity]);

    const radiusForZoom = (zoom: number) => {
      if (zoom <= 9) return 50;
      if (zoom <= 11) return 42;
      if (zoom <= 13) return 34;
      return 26;
    };

    const heat = (L as any).heatLayer(data, {
      radius: radiusForZoom(map.getZoom()),
      blur: 20,
      maxZoom: 15,
      minOpacity: 0.35,
      gradient: {
        0.15: "rgba(253, 224, 71, 0.7)",
        0.45: "rgba(249, 115, 22, 0.85)",
        1.0: "rgba(239, 68, 68, 0.95)",
      },
    }).addTo(map);

    // Optimize canvas for frequent readback operations
    const canvas = heat._canvas as HTMLCanvasElement | undefined;
    if (canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        canvas.width = canvas.width; // Reinitialize canvas with optimized context
      }
    }

    const handleZoom = () => {
      if (!map.hasLayer(heat)) return;
      heat.setOptions({ radius: radiusForZoom(map.getZoom()) });
    };

    map.on("zoomend", handleZoom);

    return () => {
      map.off("zoomend", handleZoom);
      map.removeLayer(heat);
    };
  }, [map, points]);

  return null;
}
