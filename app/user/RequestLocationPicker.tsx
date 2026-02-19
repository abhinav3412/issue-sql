"use client";

import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type PickerValue = { lat: number; lng: number } | null;
type PickerCenter = { lat: number; lng: number } | null;

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;
const PICKED_ZOOM = 14;

const PickerIcon = L.divIcon({
  html: `<div class="request-picker-marker"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: "request-picker-icon",
});

function LocationClicker({ onPick }: { onPick: (pos: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

export default function RequestLocationPicker({
  value,
  initialCenter,
  onChange,
}: {
  value: PickerValue;
  initialCenter?: PickerCenter;
  onChange: (pos: { lat: number; lng: number }) => void;
}) {
  const center = useMemo<[number, number]>(() => {
    if (value) return [value.lat, value.lng];
    if (initialCenter) return [initialCenter.lat, initialCenter.lng];
    return DEFAULT_CENTER;
  }, [value, initialCenter]);
  const zoom = value || initialCenter ? PICKED_ZOOM : DEFAULT_ZOOM;

  return (
    <div className="user-request-location-picker">
      <MapContainer center={center} zoom={zoom} className="user-request-location-map" scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationClicker onPick={onChange} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={PickerIcon}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const marker = event.target as L.Marker;
                const pos = marker.getLatLng();
                onChange({ lat: pos.lat, lng: pos.lng });
              },
            }}
          />
        )}
      </MapContainer>
      <div className="user-request-location-hint">Click the map to set your location.</div>
    </div>
  );
}
