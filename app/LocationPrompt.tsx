"use client";

import { useEffect } from "react";

export default function LocationPrompt() {
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        sessionStorage.setItem(
          "userLocation",
          JSON.stringify({ lat: latitude, lng: longitude })
        );
      },
      () => {
        // User denied or error — do nothing, location not required to browse
      },
      options
    );
  }, []);

  return null;
}
