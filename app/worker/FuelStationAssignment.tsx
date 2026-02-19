'use client';

import React, { useEffect, useState } from 'react';

interface FuelStationAssignmentProps {
  workerId: number;
  serviceRequestId: number;
  workerLat: number;
  workerLng: number;
  fuelType: string;
  litres: number;
  isCod: boolean;
  onAssignmentReceived?: (assignment: any) => void;
}

interface FuelStationAssignment {
  fuel_station_id: number;
  name: string;
  lat: number;
  lng: number;
  distance_km: number;
  supports_cod: boolean;
  selected_criteria: string;
  cod_fallback?: boolean;
  cached?: boolean;
}

export default function FuelStationAssignment({
  workerId,
  serviceRequestId,
  workerLat,
  workerLng,
  fuelType,
  litres,
  isCod,
  onAssignmentReceived,
}: FuelStationAssignmentProps) {
  const [assignment, setAssignment] = useState<FuelStationAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [showAlternatives, setShowAlternatives] = useState(false);

  // Request fuel station assignment
  useEffect(() => {
    const assignFuelStation = async () => {
      // Don't re-assign if we already have one unless location changed significantly
      if (assignment && !assignment.cached) return;

      try {
        setLoading(true);
        const response = await fetch('/api/assign-fuel-station', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker_id: workerId,
            service_request_id: serviceRequestId,
            worker_lat: workerLat,
            worker_lng: workerLng,
            fuel_type: fuelType,
            litres,
            is_cod: isCod,
            max_radius_km: 15,
            fallback_to_prepaid: true,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to assign fuel station');
          setLoading(false);
          return;
        }

        const data = await response.json();
        if (data.success) {
          setAssignment(data);
          if (onAssignmentReceived) {
            onAssignmentReceived(data);
          }

          // Load alternative stations
          if (data.fuel_station_id) {
            loadAlternatives(data.fuel_station_id);
          }
        } else {
          setError(data.error || 'Failed to assign fuel station');
        }
      } catch (err) {
        console.error('Fuel station assignment error:', err);
        setError('Failed to assign fuel station. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    assignFuelStation();
    // Removed onAssignmentReceived from dependencies to break loop if not memoized correctly
  }, [workerId, serviceRequestId, workerLat, workerLng, fuelType, litres, isCod]);

  // Load alternative fuel stations
  const loadAlternatives = async (excludedStationId: number) => {
    try {
      const response = await fetch('/api/assign-fuel-station', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_lat: workerLat,
          worker_lng: workerLng,
          fuel_type: fuelType,
          litres,
          excluded_station_id: excludedStationId,
          max_radius_km: 20,
          only_alternatives: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAlternatives(data.alternatives || []);
      }
    } catch (err) {
      console.error('Failed to load alternatives:', err);
    }
  };

  if (loading) {
    return (
      <div className="fuel-station-assignment fuel-station-loading">
        <div className="loading-spinner"></div>
        <p>Finding nearest fuel station...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fuel-station-assignment fuel-station-error">
        <div className="error-icon">⚠️</div>
        <p className="error-message">{error}</p>
        {alternatives.length > 0 && (
          <button onClick={() => setShowAlternatives(!showAlternatives)} className="view-alternatives-btn">
            View Alternatives
          </button>
        )}
      </div>
    );
  }

  if (!assignment) {
    return null;
  }


  return (
    <div className="fuel-station-assignment">
      <div className="fuel-station-card">
        {/* Header */}
        <div className="assignment-header">
          <h3>Pickup Fuel From</h3>
          {assignment.cached && (
            <span className="cached-badge">Cached</span>
          )}
          {assignment.cod_fallback && (
            <span className="fallback-badge">Prepaid (COD unavailable)</span>
          )}
        </div>

        {/* Station Info */}
        <div className="station-info">
          <div className="station-name">
            <span className="pump-icon">⛽</span>
            <span className="name-text">{assignment.name}</span>
          </div>

          <div className="station-details">
            <div className="detail-row">
              <span className="detail-label">Distance:</span>
              <span className="detail-value">{assignment.distance_km} km</span>
            </div>

            <div className="detail-row">
              <span className="detail-label">Fuel:</span>
              <span className="detail-value">
                {fuelType.charAt(0).toUpperCase() + fuelType.slice(1)} – {litres} Litres
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label">Payment:</span>
              <span className={`detail-value payment-badge ${isCod ? 'cod' : 'prepaid'}`}>
                {isCod ? 'COD' : 'Prepaid'}
              </span>
              {!assignment.supports_cod && isCod && (
                <span className="info-text">(Station doesn't support COD)</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="assignment-actions">
            {alternatives.length > 0 && (
              <button
                onClick={() => setShowAlternatives(!showAlternatives)}
                className="alternatives-btn"
              >
                📍 {alternatives.length} Alternatives
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Alternatives List */}
      {showAlternatives && alternatives.length > 0 && (
        <div className="alternatives-list">
          <h4>Alternative Stations</h4>
          <div className="alternatives-grid">
            {alternatives.map((alt) => (
              <div key={alt.id} className="alternative-card">
                <div className="alt-name">⛽ {alt.name}</div>
                <div className="alt-details">
                  <p>Distance: {alt.distance_km} km</p>
                  <p>Stock: {alt.available_stock}L {alt.fuel_type}</p>
                  {alt.cod_supported && (
                    <span className="cod-support-badge">COD Supported</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .fuel-station-assignment {
          padding: 16px;
          border-radius: 12px;
          background-color: #f5f5f5;
          margin-bottom: 16px;
        }

        .fuel-station-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 24px;
          background-color: #e3f2fd;
          border-radius: 12px;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #1976d2;
          border-top: 4px solid transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .fuel-station-loading p {
          color: #1976d2;
          font-weight: 500;
        }

        .fuel-station-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 20px;
          background-color: #ffebee;
          border-radius: 12px;
          border-left: 4px solid #d32f2f;
        }

        .error-icon {
          font-size: 32px;
        }

        .error-message {
          color: #d32f2f;
          font-weight: 500;
          text-align: center;
        }

        .view-alternatives-btn {
          padding: 8px 16px;
          background-color: #d32f2f;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .view-alternatives-btn:hover {
          background-color: #b71c1c;
        }

        .fuel-station-card {
          background-color: white;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .assignment-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          border-bottom: 2px solid #f0f0f0;
          padding-bottom: 12px;
        }

        .assignment-header h3 {
          margin: 0;
          font-size: 18px;
          color: #333;
        }

        .cached-badge,
        .fallback-badge {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 4px;
          background-color: #e0e0e0;
          color: #666;
        }

        .fallback-badge {
          background-color: #fff3e0;
          color: #e65100;
        }

        .station-info {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .station-name {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 18px;
          font-weight: 600;
          color: #222;
        }

        .pump-icon {
          font-size: 24px;
        }

        .name-text {
          color: #1976d2;
        }

        .station-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #f0f0f0;
        }

        .detail-label {
          color: #666;
          font-weight: 500;
          font-size: 14px;
        }

        .detail-value {
          color: #333;
          font-weight: 600;
          font-size: 14px;
        }

        .payment-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          background-color: #e8f5e9;
          color: #2e7d32;
        }

        .payment-badge.cod {
          background-color: #f3e5f5;
          color: #6a1b9a;
        }

        .info-text {
          font-size: 12px;
          color: #ff9800;
          margin-left: 8px;
        }

        .assignment-map {
          margin-top: 12px;
          border-radius: 8px;
          overflow: hidden;
        }

        .assignment-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .map-toggle-btn,
        .alternatives-btn {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid #1976d2;
          background-color: white;
          color: #1976d2;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .map-toggle-btn:hover,
        .alternatives-btn:hover {
          background-color: #e3f2fd;
        }

        .map-toggle-btn:active,
        .alternatives-btn:active {
          transform: scale(0.98);
        }

        .alternatives-list {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 2px solid #f0f0f0;
        }

        .alternatives-list h4 {
          margin: 0 0 12px 0;
          color: #333;
          font-size: 16px;
        }

        .alternatives-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }

        .alternative-card {
          padding: 12px;
          background-color: #f5f5f5;
          border-radius: 6px;
          border-left: 3px solid #ff9800;
        }

        .alt-name {
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
        }

        .alt-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .alt-details p {
          margin: 0;
          font-size: 13px;
          color: #666;
        }

        .cod-support-badge {
          display: inline-block;
          margin-top: 6px;
          font-size: 11px;
          padding: 2px 8px;
          background-color: #f3e5f5;
          color: #6a1b9a;
          border-radius: 4px;
          width: fit-content;
          font-weight: 600;
        }

        @media (max-width: 600px) {
          .assignment-header {
            flex-wrap: wrap;
          }

          .station-details {
            gap: 12px;
          }

          .assignment-map {
            height: 200px;
          }
        }
      `}</style>
    </div>
  );
}
