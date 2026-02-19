import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");

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

    const station = await new Promise((resolve) => {
      db.get(
        `SELECT 
          id, station_name, cod_enabled, cod_current_balance, 
          cod_balance_limit, platform_trust_flag
         FROM fuel_stations
         WHERE id = ?`,
        [fuel_station_id],
        (err, row) => resolve(row || null)
      );
    });

    if (!station) {
      return NextResponse.json(
        { success: false, error: "Fuel station not found" },
        { status: 404 }
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
        [fuel_station_id],
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
        [computedCurrentBalance, getLocalDateTimeString(), fuel_station_id],
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

    // Verify fuel station exists
    const station = await new Promise((resolve) => {
      db.get(
        "SELECT id FROM fuel_stations WHERE id = ?",
        [fuel_station_id],
        (err, row) => resolve(row || null)
      );
    });

    if (!station) {
      return NextResponse.json(
        { success: false, error: "Fuel station not found" },
        { status: 404 }
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
    values.push(fuel_station_id);

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
