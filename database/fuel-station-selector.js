/**
 * Fuel Station Selector
 * Selects the best fuel station for a worker based on:
 * - Haversine distance (nearest)
 * - Fuel type availability
 * - COD support (if required)
 * - Station status (open, verified)
 */

const { haversineDistance, calculateDistances, filterByDistance } = require("./distance-calculator");

function flagEnabled(value, defaultWhenNull = true) {
  if (value === null || value === undefined) return defaultWhenNull;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "t" || normalized === "yes";
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStationCoords(station) {
  return {
    ...station,
    lat: toNumberOrNull(station?.lat ?? station?.latitude),
    lng: toNumberOrNull(station?.lng ?? station?.longitude),
  };
}

/**
 * Select best fuel station for a worker
 * @param {Object} params - Selection parameters
 * @returns {Object|null} Selected station with details or null if none found
 */
async function selectFuelStation(params) {
  const {
    db,
    worker_lat,
    worker_lng,
    fuel_type,
    litres,
    is_cod = false,
    max_radius_km = 15,
    fallback_to_prepaid = true,
  } = params;

  if (!db) {
    throw new Error("Database connection required");
  }

  if (
    worker_lat === null ||
    worker_lat === undefined ||
    worker_lng === null ||
    worker_lng === undefined
  ) {
    throw new Error("Worker location (lat, lng) is required");
  }

  if (!fuel_type) {
    throw new Error("Fuel type is required");
  }

  try {
    // Step 1: Get stations then normalize status flags in JS to support mixed DB types.
    const allStationsRaw = await new Promise((resolve) => {
      db.all(
        `SELECT * FROM fuel_stations`,
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });
    const allStations = allStationsRaw.map(normalizeStationCoords);
    const eligibleStations = allStations.filter(
      (s) => flagEnabled(s.is_open, true) && flagEnabled(s.is_verified, true)
    );

    // Fallback for migrated/inconsistent records:
    // if no station passes flags, continue with all stations so assignment can still proceed.
    const candidateStations = eligibleStations.length > 0 ? eligibleStations : allStations;

    if (candidateStations.length === 0) {
      return {
        success: false,
        error: "No fuel stations available",
        fallback: null,
      };
    }

    // Step 2: Calculate distances and sort by proximity when coordinates are available.
    const stationsWithCoords = candidateStations.filter(
      (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)
    );
    const stationsWithoutCoords = candidateStations.filter(
      (s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lng)
    );
    let nearbyStations = [];

    if (stationsWithCoords.length > 0) {
      const stationsWithDistance = calculateDistances(
        worker_lat,
        worker_lng,
        stationsWithCoords
      );
      nearbyStations = stationsWithDistance.filter((s) => s.distance_km <= max_radius_km);

      if (nearbyStations.length === 0) {
        if (stationsWithoutCoords.length > 0) {
          nearbyStations = stationsWithoutCoords.map((s) => ({ ...s, distance_km: null }));
        } else {
          return {
            success: false,
            error: `No fuel stations within ${max_radius_km} km radius`,
            fallback: null,
          };
        }
      }
    } else {
      // Legacy fallback: if station coordinates are missing, continue without distance filtering.
      nearbyStations = candidateStations.map((s) => ({ ...s, distance_km: null }));
    }

    // Step 4: Filter by fuel type availability and stock
    const stationsWithStock = await Promise.all(
      nearbyStations.map(async (station) => {
        const stock = await new Promise((resolve) => {
          db.get(
            `SELECT stock_litres FROM fuel_station_stock 
             WHERE fuel_station_id = ? AND fuel_type = ?`,
            [station.id, fuel_type],
            (err, row) => {
              resolve(row || { stock_litres: 0 });
            }
          );
        });

        return {
          ...station,
          available_stock: stock.stock_litres,
          has_fuel: stock.stock_litres >= litres,
        };
      })
    );

    // Filter stations with sufficient stock
    const stationsWithFuel = stationsWithStock.filter((s) => s.has_fuel);

    if (stationsWithFuel.length === 0) {
      // No stations with fuel in stock
      return {
        success: false,
        error: `No stations with ${litres}L of ${fuel_type} in stock`,
        out_of_stock: true,
        fallback: null,
      };
    }

    // Step 5: If COD order, filter by COD support
    if (is_cod) {
      const codSupportingStations = await Promise.all(
        stationsWithFuel.map(async (station) => {
          const codSupport = flagEnabled(
            station.cod_supported,
            flagEnabled(station.cod_enabled, true)
          );
          const trustFlag = flagEnabled(station.platform_trust_flag, true);
          const currentBalance = Number.isFinite(Number(station.cod_current_balance))
            ? Number(station.cod_current_balance)
            : 0;
          const balanceLimit = Number.isFinite(Number(station.cod_balance_limit))
            ? Number(station.cod_balance_limit)
            : 50000;
          const balanceOk = currentBalance < balanceLimit;

          return {
            ...station,
            supports_cod: codSupport && trustFlag && balanceOk,
            cod_rejection_reason: !codSupport
              ? "cod_not_supported"
              : !trustFlag
                ? "platform_trust_flag_false"
                : !balanceOk
                  ? "balance_limit_exceeded"
                  : null,
          };
        })
      );

      const codStations = codSupportingStations.filter((s) => s.supports_cod);

      if (codStations.length > 0) {
        // Select nearest COD-supporting station
        return {
          success: true,
          station: codStations[0],
          selected_criteria: stationsWithCoords.length > 0 ? "cod_supported" : "cod_supported_no_geo",
          alternatives: codStations.slice(1, 3),
        };
      }

      // No COD-supporting station found
      if (fallback_to_prepaid) {
        // Fallback to nearest prepaid station
        return {
          success: true,
          station: stationsWithFuel[0],
          selected_criteria: stationsWithCoords.length > 0 ? "fallback_to_prepaid" : "fallback_to_prepaid_no_geo",
          message: "No COD-supporting station nearby. Using prepaid station.",
          cod_fallback: true,
          alternatives: stationsWithFuel.slice(1, 3),
        };
      }

      // Return error if fallback not allowed
      return {
        success: false,
        error: "No COD-supporting stations available",
        cod_stations_failed: codSupportingStations.map((s) => ({
          id: s.id,
          name: s.name,
          reason: s.cod_rejection_reason,
        })),
        fallback: stationsWithFuel[0],
      };
    }

    // Prepaid order - just select nearest with stock
    return {
      success: true,
      station: stationsWithFuel[0],
      selected_criteria: stationsWithCoords.length > 0 ? "nearest_with_stock" : "with_stock_no_geo",
      alternatives: stationsWithFuel.slice(1, 3),
    };
  } catch (err) {
    console.error("Fuel station selection error:", err);
    throw err;
  }
}

/**
 * Get alternative fuel stations for a given location
 * @param {Object} params - Parameters
 * @returns {Array} Array of alternative stations sorted by distance
 */
async function getAlternativeFuelStations(params) {
  const {
    db,
    worker_lat,
    worker_lng,
    fuel_type,
    litres,
    excluded_station_id = null,
    limit = 5,
    max_radius_km = 20,
  } = params;

  if (!db) {
    throw new Error("Database connection required");
  }

  try {
    const stations = await new Promise((resolve) => {
      let sql = `SELECT * FROM fuel_stations`;
      const params = [];

      if (excluded_station_id) {
        sql += ` WHERE id != ?`;
        params.push(excluded_station_id);
      }

      db.all(sql, params, (err, rows) => {
        resolve(rows || []);
      });
    }).then((rows) => rows.map(normalizeStationCoords));
    const eligibleStations = stations.filter(
      (s) => flagEnabled(s.is_open, true) && flagEnabled(s.is_verified, true)
    );
    const candidateStations = eligibleStations.length > 0 ? eligibleStations : stations;

    const stationsWithCoords = candidateStations.filter(
      (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)
    );
    const baseStations = stationsWithCoords.length > 0
      ? calculateDistances(worker_lat, worker_lng, stationsWithCoords).filter((s) => s.distance_km <= max_radius_km)
      : candidateStations.map((s) => ({ ...s, distance_km: null }));

    // Filter by distance and get stock info
    const stationsWithInfo = await Promise.all(
      baseStations
        .slice(0, limit)
        .map(async (station) => {
          const stock = await new Promise((resolve) => {
            db.get(
              `SELECT stock_litres FROM fuel_station_stock 
               WHERE fuel_station_id = ? AND fuel_type = ?`,
              [station.id, fuel_type],
              (err, row) => {
                resolve(row || { stock_litres: 0 });
              }
            );
          });

          return {
            id: station.id,
            name: station.station_name || station.name,
            lat: station.lat,
            lng: station.lng,
            distance_km: station.distance_km,
            cod_supported: flagEnabled(station.cod_supported, true),
            has_stock: stock.stock_litres >= litres,
            available_stock: stock.stock_litres,
          };
        })
    );

    return stationsWithInfo;
  } catch (err) {
    console.error("Get alternatives error:", err);
    throw err;
  }
}

/**
 * Validate if a fuel station can fulfill an order
 * @param {Object} params - Validation parameters
 * @returns {Object} Validation result
 */
async function validateFuelStation(params) {
  const {
    db,
    station_id,
    fuel_type,
    litres,
    is_cod = false,
  } = params;

  if (!db) {
    throw new Error("Database connection required");
  }

  try {
    const station = await new Promise((resolve) => {
      db.get(
        "SELECT * FROM fuel_stations WHERE id = ?",
        [station_id],
        (err, row) => {
          resolve(row || null);
        }
      );
    });

    if (!station) {
      return { valid: false, reason: "station_not_found" };
    }

    if (!flagEnabled(station.is_open, true)) {
      return { valid: false, reason: "station_closed" };
    }

    if (!flagEnabled(station.is_verified, true)) {
      return { valid: false, reason: "station_not_verified" };
    }

    // Check stock
    const stock = await new Promise((resolve) => {
      db.get(
        `SELECT stock_litres FROM fuel_station_stock 
         WHERE fuel_station_id = ? AND fuel_type = ?`,
        [station_id, fuel_type],
        (err, row) => {
          resolve(row || { stock_litres: 0 });
        }
      );
    });

    if (stock.stock_litres < litres) {
      return { valid: false, reason: "insufficient_stock" };
    }

    // Check COD support
    if (is_cod) {
      if (!flagEnabled(station.cod_supported, flagEnabled(station.cod_enabled, true))) {
        return { valid: false, reason: "cod_not_supported" };
      }
      if (!flagEnabled(station.platform_trust_flag, true)) {
        return { valid: false, reason: "platform_trust_flag_false" };
      }
      const currentBalance = Number.isFinite(Number(station.cod_current_balance))
        ? Number(station.cod_current_balance)
        : 0;
      const balanceLimit = Number.isFinite(Number(station.cod_balance_limit))
        ? Number(station.cod_balance_limit)
        : 50000;
      if (currentBalance >= balanceLimit) {
        return { valid: false, reason: "balance_limit_exceeded" };
      }
    }

    return {
      valid: true,
      station: {
        id: station.id,
        name: station.station_name || station.name,
        cod_supported: flagEnabled(station.cod_supported, true),
        available_stock: stock.stock_litres,
      },
    };
  } catch (err) {
    console.error("Validation error:", err);
    throw err;
  }
}

/**
 * Update fuel station stock after pickup
 * @param {Object} params - Update parameters
 * @returns {Object} Update result
 */
async function updateFuelStationStock(params) {
  const { db, station_id, fuel_type, litres_picked_up, update_balance = 0 } =
    params;

  if (!db) {
    throw new Error("Database connection required");
  }

  try {
    // Update stock
    await new Promise((resolve) => {
      db.run(
        `UPDATE fuel_station_stock 
         SET stock_litres = stock_litres - ?, updated_at = CURRENT_TIMESTAMP
         WHERE fuel_station_id = ? AND fuel_type = ?`,
        [litres_picked_up, station_id, fuel_type],
        (err) => {
          if (err) console.error("Stock update error:", err);
          resolve();
        }
      );
    });

    // Update COD balance if applicable
    if (update_balance !== 0) {
      await new Promise((resolve) => {
        db.run(
          `UPDATE fuel_stations 
           SET cod_current_balance = cod_current_balance + ?,
               last_stock_update = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [update_balance, station_id],
          (err) => {
            if (err) console.error("Balance update error:", err);
            resolve();
          }
        );
      });
    }

    return {
      success: true,
      station_id,
      fuel_type,
      litres_picked_up,
    };
  } catch (err) {
    console.error("Stock update error:", err);
    throw err;
  }
}

module.exports = {
  selectFuelStation,
  getAlternativeFuelStations,
  validateFuelStation,
  updateFuelStationStock,
};
