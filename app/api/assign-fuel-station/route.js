import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../database/db");
const {
  selectFuelStation,
  getAlternativeFuelStations,
  validateFuelStation,
} = require("../../../database/fuel-station-selector");
const { haversineDistance } = require("../../../database/distance-calculator");

/**
 * POST /api/assign-fuel-station
 * Assign nearest fuel station to a worker
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      worker_id,
      service_request_id,
      worker_lat,
      worker_lng,
      fuel_type = "petrol",
      litres = 1,
      is_cod = false,
      max_radius_km = 15,
      fallback_to_prepaid = true,
      only_alternatives = false,
      excluded_station_id = null,
    } = body;

    // Handle only_alternatives request
    if (only_alternatives) {
      if (!worker_lat || !worker_lng) {
        return NextResponse.json({ error: "Location required" }, { status: 400 });
      }
      const alternatives = await getAlternativeFuelStations({
        db: getDB(),
        worker_lat: Number(worker_lat),
        worker_lng: Number(worker_lng),
        fuel_type,
        litres: Number(litres),
        excluded_station_id,
        max_radius_km: max_radius_km || 20,
        limit: 5,
      });
      return NextResponse.json({ success: true, alternatives });
    }

    // Validate inputs
    if (!worker_id) {
      return NextResponse.json(
        { error: "worker_id is required" },
        { status: 400 }
      );
    }

    if (!service_request_id) {
      return NextResponse.json(
        { error: "service_request_id is required" },
        { status: 400 }
      );
    }

    if (
      worker_lat === null ||
      worker_lat === undefined ||
      worker_lng === null ||
      worker_lng === undefined
    ) {
      return NextResponse.json(
        { error: "worker_lat and worker_lng are required" },
        { status: 400 }
      );
    }

    const db = getDB();
    const now = getLocalDateTimeString();

    // Ensure tables exist
    await ensureTables(db);

    // Step 1: Check cache first (valid if worker hasn't moved > 500m)
    const cachedAssignment = await new Promise((resolve) => {
      db.get(
        `SELECT * FROM worker_station_cache 
         WHERE service_request_id = ? AND worker_id = ? AND is_valid = 1
         ORDER BY assigned_at DESC LIMIT 1`,
        [service_request_id, worker_id],
        (err, row) => resolve(row || null)
      );
    });

    if (cachedAssignment) {
      const cacheDistance = haversineDistance(
        cachedAssignment.worker_lat,
        cachedAssignment.worker_lng,
        worker_lat,
        worker_lng
      );

      // If worker hasn't moved more than 500m, use cached assignment
      if (cacheDistance <= 0.5) {
        const station = await new Promise((resolve) => {
          db.get(
            "SELECT * FROM fuel_stations WHERE id = ?",
            [cachedAssignment.fuel_station_id],
            (err, row) => resolve(row || null)
          );
        });

        if (station) {
          return NextResponse.json({
            success: true,
            fuel_station_id: station.id,
            name: station.name,
            lat: station.lat,
            lng: station.lng,
            distance_km: cachedAssignment.distance_km,
            supports_cod: station.cod_supported === 1,
            cached: true,
            cached_at: cachedAssignment.assigned_at,
          });
        }
      } else {
        // Invalidate cache if worker moved too far
        await new Promise((resolve) => {
          db.run(
            `UPDATE worker_station_cache 
             SET is_valid = 0, invalidated_at = ? 
             WHERE service_request_id = ?`,
            [now, service_request_id],
            () => resolve()
          );
        });
      }
    }

    // Step 2: Select fuel station
    const selection = await selectFuelStation({
      db,
      worker_lat: Number(worker_lat),
      worker_lng: Number(worker_lng),
      fuel_type,
      litres: Number(litres),
      is_cod,
      max_radius_km,
      fallback_to_prepaid,
    });

    if (!selection.success) {
      return NextResponse.json(
        {
          success: false,
          error: selection.error,
          details: {
            out_of_stock: selection.out_of_stock || false,
            fallback_station: selection.fallback || null,
          },
        },
        { status: 404 }
      );
    }

    const station = selection.station;

    // Step 3: Create assignment record
    await new Promise((resolve) => {
      db.run(
        `INSERT INTO fuel_station_assignments (
          service_request_id, worker_id, fuel_station_id, fuel_type, litres,
          distance_km, is_cod, supports_cod, assigned_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          service_request_id,
          worker_id,
          station.id,
          fuel_type,
          litres,
          station.distance_km,
          is_cod ? 1 : 0,
          station.cod_supported ? 1 : 0,
          now,
          "assigned",
        ],
        (err) => {
          if (err) console.error("Assignment record creation failed:", err);
          resolve();
        }
      );
    });

    // Step 4: Cache the assignment
    await new Promise((resolve) => {
      db.run(
        `INSERT INTO worker_station_cache (
          worker_id, service_request_id, fuel_station_id,
          worker_lat, worker_lng, distance_km, assigned_at, is_valid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          worker_id,
          service_request_id,
          station.id,
          worker_lat,
          worker_lng,
          station.distance_km,
          now,
        ],
        (err) => {
          if (err) console.error("Cache creation failed:", err);
          resolve();
        }
      );
    });

    // Step 5: Update service request with fuel station
    await new Promise((resolve) => {
      db.run(
        `UPDATE service_requests 
         SET fuel_station_id = ? 
         WHERE id = ?`,
        [station.id, service_request_id],
        (err) => {
          if (err) console.error("Service request update failed:", err);
          resolve();
        }
      );
    });

    return NextResponse.json({
      success: true,
      fuel_station_id: station.id,
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      distance_km: station.distance_km,
      supports_cod: selection.station.supports_cod === 1 || (selection.station.supports_cod ?? true),
      selected_criteria: selection.selected_criteria,
      cod_fallback: selection.cod_fallback || false,
      message: selection.message || null,
      alternatives: selection.alternatives?.slice(0, 2) || [],
      assignment_id: service_request_id,
    });
  } catch (err) {
    console.error("Fuel station assignment error:", err);
    return NextResponse.json(
      { error: "Failed to assign fuel station", details: err.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/assign-fuel-station?service_request_id=123
 * Get current fuel station assignment for a service request
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const serviceRequestId = url.searchParams.get("service_request_id");

    if (!serviceRequestId) {
      return NextResponse.json(
        { error: "service_request_id query parameter is required" },
        { status: 400 }
      );
    }

    const db = getDB();

    // Get the most recent assignment
    const assignment = await new Promise((resolve) => {
      db.get(
        `SELECT a.*, fs.name, fs.latitude AS lat, fs.longitude AS lng, fs.cod_supported 
         FROM fuel_station_assignments a
         LEFT JOIN fuel_stations fs ON a.fuel_station_id = fs.id
         WHERE a.service_request_id = ?
         ORDER BY a.assigned_at DESC
         LIMIT 1`,
        [serviceRequestId],
        (err, row) => resolve(row || null)
      );
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "No fuel station assigned for this service request" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      fuel_station_id: assignment.fuel_station_id,
      name: assignment.name,
      lat: assignment.lat,
      lng: assignment.lng,
      distance_km: assignment.distance_km,
      fuel_type: assignment.fuel_type,
      litres: assignment.litres,
      supports_cod: assignment.cod_supported === 1,
      payment_mode: assignment.is_cod === 1 ? "COD" : "Prepaid",
      status: assignment.status,
      assigned_at: assignment.assigned_at,
    });
  } catch (err) {
    console.error("Get assignment error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve assignment" },
      { status: 500 }
    );
  }
}

/**
 * Ensure all required tables exist
 */
function ensureTables(db) {
  return Promise.all([
    new Promise((resolve) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS fuel_station_assignments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_request_id INTEGER NOT NULL,
          worker_id INTEGER NOT NULL,
          fuel_station_id INTEGER NOT NULL,
          fuel_type VARCHAR(50) NOT NULL,
          litres REAL NOT NULL,
          distance_km REAL NOT NULL,
          is_cod INTEGER DEFAULT 0,
          supports_cod INTEGER DEFAULT 0,
          assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          picked_up_at DATETIME,
          status VARCHAR(30) DEFAULT 'assigned',
          rejection_reason VARCHAR(200),
          reassignment_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (service_request_id) REFERENCES service_requests(id),
          FOREIGN KEY (worker_id) REFERENCES workers(id),
          FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id)
        )`,
        (err) => {
          if (err && !/already exists/i.test(err.message)) {
            console.error("Create assignments table failed:", err);
          }
          resolve();
        }
      );
    }),
    new Promise((resolve) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS worker_station_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          worker_id INTEGER NOT NULL,
          service_request_id INTEGER NOT NULL,
          fuel_station_id INTEGER NOT NULL,
          assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          worker_lat REAL,
          worker_lng REAL,
          distance_km REAL,
          is_valid INTEGER DEFAULT 1,
          invalidated_at DATETIME,
          FOREIGN KEY (worker_id) REFERENCES workers(id),
          FOREIGN KEY (service_request_id) REFERENCES service_requests(id),
          FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id)
        )`,
        (err) => {
          if (err && !/already exists/i.test(err.message)) {
            console.error("Create cache table failed:", err);
          }
          resolve();
        }
      );
    }),
  ]);
}
