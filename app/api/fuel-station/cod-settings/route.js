import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");

function hasTableColumn(db, tableName, colName) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
      if (err) return resolve(false);
      const found = (rows || []).some(
        (c) => String(c.name || "").toLowerCase() === String(colName).toLowerCase()
      );
      resolve(found);
    });
  });
}

async function findStationByIdOrUserId(db, idValue) {
  let station = await new Promise((resolve) => {
    db.get(
      `SELECT 
        id, station_name, cod_enabled, cod_current_balance, 
        cod_balance_limit, platform_trust_flag
       FROM fuel_stations
       WHERE id = ?`,
      [idValue],
      (err, row) => resolve(row || null)
    );
  });

  if (!station) {
    station = await new Promise((resolve) => {
      db.get(
        `SELECT 
          id, station_name, cod_enabled, cod_current_balance, 
          cod_balance_limit, platform_trust_flag
         FROM fuel_stations
         WHERE user_id = ?`,
        [idValue],
        (err, row) => resolve(row || null)
      );
    });
  }

  return station;
}

async function ensureStationRowForUser(db, userId) {
  const user = await new Promise((resolve) => {
    db.get(
      "SELECT id, first_name, last_name, role FROM users WHERE id = ?",
      [userId],
      (err, row) => resolve(row || null)
    );
  });

  if (!user) return null;

  const hasUserId = await hasTableColumn(db, "fuel_stations", "user_id");
  const hasStationName = await hasTableColumn(db, "fuel_stations", "station_name");
  const hasCodEnabled = await hasTableColumn(db, "fuel_stations", "cod_enabled");
  const hasCodCurrentBalance = await hasTableColumn(db, "fuel_stations", "cod_current_balance");
  const hasCodBalanceLimit = await hasTableColumn(db, "fuel_stations", "cod_balance_limit");
  const hasPlatformTrustFlag = await hasTableColumn(db, "fuel_stations", "platform_trust_flag");
  const hasCreatedAt = await hasTableColumn(db, "fuel_stations", "created_at");
  const hasUpdatedAt = await hasTableColumn(db, "fuel_stations", "updated_at");

  const now = getLocalDateTimeString();
  const inferredName = `${(user.first_name || "Fuel").toString()} ${(user.last_name || "Station").toString()}`.trim();

  const cols = [];
  const vals = [];
  if (hasUserId) {
    cols.push("user_id");
    vals.push(user.id);
  }
  if (hasStationName) {
    cols.push("station_name");
    vals.push(inferredName || `Station ${user.id}`);
  }
  if (hasCodEnabled) {
    cols.push("cod_enabled");
    vals.push(1);
  }
  if (hasCodCurrentBalance) {
    cols.push("cod_current_balance");
    vals.push(0);
  }
  if (hasCodBalanceLimit) {
    cols.push("cod_balance_limit");
    vals.push(50000);
  }
  if (hasPlatformTrustFlag) {
    cols.push("platform_trust_flag");
    vals.push(1);
  }
  if (hasCreatedAt) {
    cols.push("created_at");
    vals.push(now);
  }
  if (hasUpdatedAt) {
    cols.push("updated_at");
    vals.push(now);
  }

  if (cols.length === 0) return null;

  await new Promise((resolve) => {
    const placeholders = cols.map(() => "?").join(", ");
    db.run(
      `INSERT INTO fuel_stations (${cols.join(", ")}) VALUES (${placeholders})`,
      vals,
      () => resolve()
    );
  });

  return findStationByIdOrUserId(db, user.id);
}

// Get COD settings
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fuel_station_id = searchParams.get("fuel_station_id");

    if (!fuel_station_id) {
      return NextResponse.json(
        { success: false, error: "fuel_station_id is required" },
        { status: 400 }
      );
    }

    const db = getDB();

    let station = await findStationByIdOrUserId(db, fuel_station_id);
    if (!station) {
      station = await ensureStationRowForUser(db, fuel_station_id);
    }

    if (!station) {
      return NextResponse.json(
        {
          success: true,
          cod_settings: {
            station_id: Number(fuel_station_id),
            station_name: `Station ${fuel_station_id}`,
            cod_enabled: false,
            cod_current_balance: 0,
            cod_balance_limit: 50000,
            platform_trust_flag: false,
            can_accept_cod: false,
          },
          pending_cod: {
            count: 0,
            total_pending: 0,
          },
          warning: "Fuel station record not found; returning default settings.",
        },
        { status: 200 }
      );
    }

    // Source of truth for COD balance: COD requests pending collection.
    const pending_cod = await new Promise((resolve) => {
      db.get(
        `SELECT 
          COUNT(*) as count,
          SUM(amount) as total_pending
         FROM service_requests
         WHERE fuel_station_id = ?
           AND payment_method = 'COD'
           AND payment_status = 'PENDING_COLLECTION'`,
        [station.id],
        (err, row) => resolve(row || {})
      );
    });
    const computedCurrentBalance = Number(pending_cod.total_pending || 0);

    // Keep fuel_stations.cod_current_balance in sync for legacy consumers.
    await new Promise((resolve) => {
      db.run(
        `UPDATE fuel_stations
         SET cod_current_balance = ?, updated_at = ?
         WHERE id = ?`,
        [computedCurrentBalance, getLocalDateTimeString(), station.id],
        () => resolve()
      );
    });

    return NextResponse.json(
      {
        success: true,
        cod_settings: {
          station_id: station.id,
          station_name: station.station_name,
          cod_enabled: station.cod_enabled === 1,
          cod_current_balance: computedCurrentBalance,
          cod_balance_limit: station.cod_balance_limit,
          platform_trust_flag: station.platform_trust_flag === 1,
          can_accept_cod: station.cod_enabled === 1 && station.platform_trust_flag === 1 && 
                          computedCurrentBalance < station.cod_balance_limit,
        },
        pending_cod: {
          count: pending_cod.count || 0,
          total_pending: computedCurrentBalance,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Get COD settings error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Update COD settings
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { fuel_station_id, cod_enabled, cod_balance_limit } = body || {};

    if (!fuel_station_id) {
      return NextResponse.json(
        { success: false, error: "fuel_station_id is required" },
        { status: 400 }
      );
    }

    const db = getDB();
    const updatedAt = getLocalDateTimeString();

    // Accept either fuel_stations.id or fuel_stations.user_id.
    let station = await findStationByIdOrUserId(db, fuel_station_id);
    if (!station) {
      station = await ensureStationRowForUser(db, fuel_station_id);
    }

    if (!station) {
      return NextResponse.json(
        { success: false, error: "Fuel station not found" },
        { status: 200 }
      );
    }

    // Build update query
    const updates = [];
    const values = [];

    if (cod_enabled !== undefined) {
      updates.push("cod_enabled = ?");
      values.push(cod_enabled ? 1 : 0);
    }

    if (cod_balance_limit !== undefined) {
      if (typeof cod_balance_limit !== "number" || cod_balance_limit < 0) {
        return NextResponse.json(
          { success: false, error: "cod_balance_limit must be a non-negative number" },
          { status: 400 }
        );
      }
      updates.push("cod_balance_limit = ?");
      values.push(cod_balance_limit);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    updates.push("updated_at = ?");
    values.push(updatedAt);
    values.push(station.id);

    const result = await new Promise((resolve, reject) => {
      db.run(
        `UPDATE fuel_stations SET ${updates.join(", ")} WHERE id = ?`,
        values,
        function (err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });

    if (result.changes === 0) {
      return NextResponse.json(
        { success: false, error: "Failed to update COD settings" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "COD settings updated successfully",
        updated_at: updatedAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Update COD settings error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
