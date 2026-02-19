'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { haversineDistance } from '@/database/distance-calculator';

interface LocationUpdate {
  lat: number;
  lng: number;
  timestamp: number;
}

interface RecalculationThreshold {
  distance_km: number; // Recalculate if worker moves this far
  time_minutes: number; // Recalculate after this time interval
}

interface UseWorkerLocationTrackingProps {
  serviceRequestId: number;
  initialLat?: number;
  initialLng?: number;
  recalculationThreshold?: RecalculationThreshold;
  onLocationUpdate?: (lat: number, lng: number) => void;
  onRecalculationNeeded?: () => void;
}

export function useWorkerLocationTracking({
  serviceRequestId,
  initialLat = 0,
  initialLng = 0,
  recalculationThreshold = { distance_km: 0.5, time_minutes: 10 },
  onLocationUpdate,
  onRecalculationNeeded,
}: UseWorkerLocationTrackingProps) {
  const [currentLocation, setCurrentLocation] = useState({ lat: initialLat, lng: initialLng });
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAssignmentLocationRef = useRef({ lat: initialLat, lng: initialLng, timestamp: Date.now() });
  const watchIdRef = useRef<number | null>(null);

  // Start location tracking
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setTracking(true);
    setError(null);

    const successCallback = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      const newLocation = { lat: latitude, lng: longitude };

      // Update current location
      setCurrentLocation(newLocation);
      if (onLocationUpdate) {
        onLocationUpdate(latitude, longitude);
      }

      // Check if recalculation is needed
      const distanceMoved = haversineDistance(
        lastAssignmentLocationRef.current.lat,
        lastAssignmentLocationRef.current.lng,
        latitude,
        longitude
      );

      const timeSinceLastAssignment = (Date.now() - lastAssignmentLocationRef.current.timestamp) / (1000 * 60); // in minutes

      const needsRecalculation =
        distanceMoved > recalculationThreshold.distance_km ||
        timeSinceLastAssignment > recalculationThreshold.time_minutes;

      if (needsRecalculation) {
        // Reset the last assignment location
        lastAssignmentLocationRef.current = {
          lat: latitude,
          lng: longitude,
          timestamp: Date.now(),
        };

        if (onRecalculationNeeded) {
          onRecalculationNeeded();
        }
      }
    };

    const errorCallback = (error: GeolocationPositionError) => {
      const errorMessage = getGeolocationErrorMessage(error.code);
      setError(errorMessage);
      setTracking(false);
    };

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    // Watch location changes
    watchIdRef.current = navigator.geolocation.watchPosition(
      successCallback,
      errorCallback,
      options
    ) as unknown as number;
  }, [onLocationUpdate, onRecalculationNeeded, recalculationThreshold]);

  // Stop location tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  // Update last assignment location (called after fuel station is assigned)
  const updateAssignmentLocation = useCallback(() => {
    lastAssignmentLocationRef.current = {
      lat: currentLocation.lat,
      lng: currentLocation.lng,
      timestamp: Date.now(),
    };
  }, [currentLocation]);

  // Get current location once (for initial setup)
  const getCurrentLocation = useCallback(() => {
    return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          resolve({ lat: latitude, lng: longitude });
        },
        (error) => {
          reject(new Error(getGeolocationErrorMessage(error.code)));
        }
      );
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    currentLocation,
    tracking,
    error,
    startTracking,
    stopTracking,
    getCurrentLocation,
    updateAssignmentLocation,
    distanceFromLastAssignment: haversineDistance(
      lastAssignmentLocationRef.current.lat,
      lastAssignmentLocationRef.current.lng,
      currentLocation.lat,
      currentLocation.lng
    ),
  };
}

/**
 * Get human-readable geolocation error messages
 */
function getGeolocationErrorMessage(code: number): string {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return 'Location permission denied. Please enable location access in settings.';
    case 2: // POSITION_UNAVAILABLE
      return 'Location information is unavailable.';
    case 3: // TIMEOUT
      return 'Location request timed out. Please try again.';
    default:
      return 'An unknown location error occurred.';
  }
}

/**
 * Hook for monitoring location and automatically reassigning fuel station if worker moves too far
 */
export function useAutoReassignFuelStation({
  serviceRequestId,
  workerId,
  fuelType,
  litres,
  isCod,
  enabled = true,
}: {
  serviceRequestId: number;
  workerId: number;
  fuelType: string;
  litres: number;
  isCod: boolean;
  enabled?: boolean;
}) {
  const [assignmentStatus, setAssignmentStatus] = useState<'pending' | 'assigned' | 'reassigning'>('pending');
  const [reassignmentCount, setReassignmentCount] = useState(0);
  const [lastReassignmentTime, setLastReassignmentTime] = useState<number>(0);

  const {
    currentLocation,
    startTracking,
    updateAssignmentLocation,
    distanceFromLastAssignment,
  } = useWorkerLocationTracking({
    serviceRequestId,
    recalculationThreshold: { distance_km: 0.5, time_minutes: 10 },
    onRecalculationNeeded: async () => {
      // Prevent rapid reassignments (minimum 1 minute between reassignments)
      const timeSinceLastReassignment = (Date.now() - lastReassignmentTime) / (1000 * 60);
      if (timeSinceLastReassignment < 1) {
        return;
      }

      // Trigger reassignment
      setAssignmentStatus('reassigning');
      try {
        const response = await fetch('/api/assign-fuel-station', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker_id: workerId,
            service_request_id: serviceRequestId,
            worker_lat: currentLocation.lat,
            worker_lng: currentLocation.lng,
            fuel_type: fuelType,
            litres,
            is_cod: isCod,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setAssignmentStatus('assigned');
            setReassignmentCount((prev) => prev + 1);
            setLastReassignmentTime(Date.now());
            updateAssignmentLocation();
          }
        }
      } catch (err) {
        console.error('Fuel station reassignment error:', err);
        setAssignmentStatus('assigned'); // Keep previous assignment
      }
    },
  });

  // Start tracking when component mounts (if enabled)
  useEffect(() => {
    if (enabled) {
      startTracking();
    }
  }, [enabled, startTracking]);

  return {
    assignmentStatus,
    reassignmentCount,
    currentLocation,
    distanceFromLastAssignment,
    updateAssignmentLocation,
  };
}

/**
 * Calculate estimated time to arrival at fuel station
 * Assumes average speed of 30 km/h in urban areas
 */
export function estimateTimeToArrival(distanceKm: number, speedKmh = 30): { minutes: number; seconds: number } {
  const minutes = Math.floor((distanceKm / speedKmh) * 60);
  const seconds = Math.round((((distanceKm / speedKmh) * 60 - minutes) * 60));
  return { minutes, seconds };
}

/**
 * Format time to arrival for display
 */
export function formatTimeToArrival(distanceKm: number): string {
  const { minutes, seconds } = estimateTimeToArrival(distanceKm);

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
