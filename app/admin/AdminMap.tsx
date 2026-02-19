"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from "react-leaflet";
import L from "leaflet";
// import workerAvatar from "../../public/worker-avatar.png";
// import adminAvatar from "../../public/admin-avatar.png";

// Fix default marker icon in Next.js
const DefaultIcon = L.icon({
  iconUrl: "/admin-avatar.png",
  iconRetinaUrl: "/admin-avatar.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [46, 46],
  iconAnchor: [23, 46],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom fuel station icon
const FuelStationIcon = L.divIcon({
  html: `<div class="map-marker-premium fuel-marker">⛽</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
  className: "fuel-station-icon-wrap",
});

// Custom worker icon
const WorkerIcon = L.icon({
  iconUrl: "/worker-avatar.png",
  iconSize: [48, 48],
  iconAnchor: [24, 48],
  popupAnchor: [0, -36],
  className: "worker-avatar-icon",
});

// Custom request icon
const RequestIcon = L.divIcon({
  html: `<div class="map-marker-premium request-marker">📍</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
  className: "request-icon-wrap",
});

const UserPulseIcon = L.divIcon({
  html: `<div class="user-location-blip"><span class="user-location-core"></span></div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22],
  className: "user-location-icon-wrap",
});

const WorkerAvatarIcon = L.icon({
  iconUrl:
    "data:image/jpeg;base64,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",
  iconSize: [48, 48],
  iconAnchor: [24, 48],
  popupAnchor: [0, -36],
  className: "worker-avatar-icon",
});
const AssignedUserIcon = L.divIcon({
  html: `<div class="user-ped-blip"><span class="user-ped-icon">🚶‍♂️</span></div>`,
  iconSize: [46, 46],
  iconAnchor: [23, 23],
  popupAnchor: [0, -22],
  className: "user-ped-icon-wrap",
});

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629]; // India fallback
const DEFAULT_ZOOM = 12;

type TileType = "street" | "satellite";

// Centers map on position and keeps marker in sync
function MapController({
  position,
}: {
  position: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo([position.lat, position.lng], 14, { duration: 1 });
    }
  }, [map, position]);
  return null;
}

// Recentre button: must be inside MapContainer to use useMap
function RecentreButton({
  position,
}: {
  position: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  const handleClick = () => {
    if (position) {
      map.flyTo([position.lat, position.lng], 14, { duration: 0.5 });
    } else {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.5 });
    }
  };
  return (
    <div className="admin-map-recentre-wrap">
      <button type="button" className="admin-map-recentre-btn" onClick={handleClick} title="Recentre map">
        📍
      </button>
    </div>
  );
}

type AdminMapProps = {
  popupLabel?: string;
  mapClassName?: string;
  wrapClassName?: string;
  userMarkerType?: "pin" | "pulsing" | "bike";
  showRequests?: boolean;
  geoJsonOverlays?: Array<{
    data: any;
    style?: any;
  }>;
  onPositionChange?: (position: { lat: number; lng: number }) => void;
  watchPosition?: boolean;
  serviceRequests?: any[];
  workers?: any[];
  children?: ReactNode;
};

export default function AdminMap({
  popupLabel = "Your location (Admin)",
  mapClassName = "admin-leaflet-map",
  wrapClassName = "admin-leaflet-wrap",
  userMarkerType = "pin",
  showRequests = true,
  geoJsonOverlays = [],
  onPositionChange,
  watchPosition = false,
  serviceRequests = [],
  workers = [],
  children,
}: AdminMapProps = {}) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [fuelStations, setFuelStations] = useState<Array<{ id: number; name: string; latitude: number; longitude: number }>>([]);
  const [tileType, setTileType] = useState<TileType>("street");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showTileControls, setShowTileControls] = useState(false);

  useEffect(() => {
    fetch("/api/fuel-stations")
      .then((res) => res.json())
      .then((data) => setFuelStations(Array.isArray(data) ? data : []))
      .catch(() => setFuelStations([]));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    // Browsers only allow geolocation on secure origins: HTTPS or http://localhost
    if (!window.isSecureContext) {
      setLocationError(
        "Location works only on HTTPS or localhost. Open this page at http://localhost:3000 (or use HTTPS) to see your position."
      );
      return;
    }
    if (watchPosition) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationError(null);
        },
        (err) => {
          const msg =
            err.code === 1
              ? "Location denied. Allow location for this site to see your position on the map."
              : err.code === 2
                ? "Location unavailable. Try again or open via http://localhost:3000 or HTTPS."
                : err.message || "Could not get your location.";
          setLocationError(msg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationError(null);
      },
      (err) => {
        const msg =
          err.code === 1
            ? "Location denied. Allow location for this site to see your position on the map."
            : err.code === 2
              ? "Location unavailable. Try again or open via http://localhost:3000 or HTTPS."
              : err.message || "Could not get your location.";
        setLocationError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    if (position) onPositionChange?.(position);
  }, [position, onPositionChange]);

  return (
    <div className={wrapClassName}>
      <button
        type="button"
        className="admin-map-tile-toggle"
        onClick={() => setShowTileControls(!showTileControls)}
        title="Toggle map layers"
      >
        ◇
      </button>
      {showTileControls && (
        <div className="admin-map-tile-controls">
          <button
            type="button"
            className={`admin-map-tile-btn ${tileType === "street" ? "admin-map-tile-btn--active" : ""}`}
            onClick={() => setTileType("street")}
          >
            Street
          </button>
          <button
            type="button"
            className={`admin-map-tile-btn ${tileType === "satellite" ? "admin-map-tile-btn--active" : ""}`}
            onClick={() => setTileType("satellite")}
          >
            Satellite
          </button>
        </div>
      )}
      {locationError && (
        <div className="admin-map-location-error">{locationError}</div>
      )}
      <MapContainer
        center={position ?? DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className={mapClassName}
        scrollWheelZoom={true}
      >
        {tileType === "street" && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        {tileType === "satellite" && (
          <TileLayer
            attribution="&copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        )}
        {geoJsonOverlays.map((overlay, idx) => (
          <GeoJSON
            key={`geo-${idx}`}
            data={overlay.data}
            style={overlay.style}
          />
        ))}
        {children}
        <MapController position={position} />
        <RecentreButton position={position} />

        {/* Your Location */}
        {position && (
          <Marker
            position={[position.lat, position.lng]}
            icon={
              userMarkerType === "pulsing"
                ? UserPulseIcon
                : userMarkerType === "bike"
                  ? WorkerAvatarIcon
                  : DefaultIcon
            }
          >
            <Popup>{popupLabel}</Popup>
          </Marker>
        )}

        {/* Workers */}
        {workers.filter(w => w.latitude && w.longitude).map((worker) => (
          <Marker key={`w-${worker.id}`} position={[worker.latitude, worker.longitude]} icon={WorkerIcon}>
            <Popup>
              <div className="leaflet-popup-premium-content">
                <strong>Worker: {worker.first_name} {worker.last_name}</strong><br />
                <span className="premium-success">Status: {worker.status}</span><br />
                <span>Role: {worker.service_type}</span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Requests */}
        {showRequests &&
          serviceRequests.filter(r => r.user_lat && r.user_lon).map((req) => (
            <Marker
              key={`r-${req.id}`}
              position={[req.user_lat, req.user_lon]}
              icon={req.assigned_worker ? AssignedUserIcon : RequestIcon}
            >
              <Popup>
                <div className="leaflet-popup-premium-content">
                  <strong>Request: #{req.id}</strong><br />
                  <span>Service: {req.service_type}</span><br />
                  <span className="premium-accent">Status: {req.status}</span><br />
                  <span>Vehicle: {req.vehicle_number}</span>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Fuel Stations */}
        {fuelStations.map((station) => (
          <Marker key={station.id} position={[station.latitude, station.longitude]} icon={FuelStationIcon}>
            <Popup>⛽ {station.name}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
