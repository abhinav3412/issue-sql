import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");

async function hasColumn(db, tableName, columnName) {
  const columns = await new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  return columns.some((col) => col.name === columnName);
}

async function resolveStationId(db, rawId) {
  const byId = await new Promise((resolve) => {
    db.get("SELECT id FROM fuel_stations WHERE id = ?", [rawId], (err, row) => resolve(row || null));
  });
  if (byId?.id) return byId.id;

  const hasUserId = await hasColumn(db, "fuel_stations", "user_id");
  if (!hasUserId) return null;

  const byUserId = await new Promise((resolve) => {
    db.get("SELECT id FROM fuel_stations WHERE user_id = ?", [rawId], (err, row) => resolve(row || null));
  });
  return byUserId?.id || null;
}

// Get stock levels for a fuel station
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
    const supportsLastRefilledAt = await hasColumn(db, "fuel_station_stock", "last_refilled_at");
    const selectSql = supportsLastRefilledAt
      ? `SELECT id, fuel_type, stock_litres, last_refilled_at, updated_at
         FROM fuel_station_stock
         WHERE fuel_station_id = ?
         ORDER BY fuel_type`
      : `SELECT id, fuel_type, stock_litres, NULL as last_refilled_at, updated_at
         FROM fuel_station_stock
         WHERE fuel_station_id = ?
         ORDER BY fuel_type`;

    const resolvedStationId = await resolveStationId(db, fuel_station_id);
    if (!resolvedStationId) {
      return NextResponse.json(
        { success: true, stocks: [] },
        { status: 200 }
      );
    }

    // Get stock levels
    let stocks = await new Promise((resolve) => {
      db.all(
        selectSql,
        [resolvedStationId],
        (err, rows) => resolve(rows || [])
      );
    });

    // If no stocks found, initialize them
    if (stocks.length === 0) {
      const updatedAt = getLocalDateTimeString();
      const types = ['petrol', 'diesel'];

      for (const type of types) {
        await new Promise((resolve, reject) => {
          if (supportsLastRefilledAt) {
            db.run(
              `INSERT INTO fuel_station_stock (fuel_station_id, fuel_type, stock_litres, last_refilled_at, updated_at)
               VALUES (?, ?, ?, ?, ?)`,
              [resolvedStationId, type, 0, updatedAt, updatedAt],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          } else {
            db.run(
              `INSERT INTO fuel_station_stock (fuel_station_id, fuel_type, stock_litres, updated_at)
               VALUES (?, ?, ?, ?)`,
              [resolvedStationId, type, 0, updatedAt],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          }
        });
      }

      // Re-fetch stocks
      stocks = await new Promise((resolve) => {
        db.all(
          selectSql,
          [resolvedStationId],
          (err, rows) => resolve(rows || [])
        );
      });
    }

    return NextResponse.json(
      { success: true, stocks },
      { status: 200 }
    );
  } catch (err) {
    console.error("Get stock error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Update stock levels
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { fuel_station_id, fuel_type, stock_litres } = body || {};

    if (!fuel_station_id || !fuel_type || stock_litres === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: fuel_station_id, fuel_type, stock_litres" },
        { status: 400 }
      );
    }

    // Validate stock is non-negative
    if (typeof stock_litres !== "number" || stock_litres < 0) {
      return NextResponse.json(
        { success: false, error: "stock_litres must be a non-negative number" },
        { status: 400 }
      );
    }

    const db = getDB();
    const updatedAt = getLocalDateTimeString();
    const supportsLastRefilledAt = await hasColumn(db, "fuel_station_stock", "last_refilled_at");

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

    // Update stock
    const result = await new Promise((resolve, reject) => {
      const sql = supportsLastRefilledAt
        ? `UPDATE fuel_station_stock 
           SET stock_litres = ?, last_refilled_at = ?, updated_at = ?
           WHERE fuel_station_id = ? AND fuel_type = ?`
        : `UPDATE fuel_station_stock 
           SET stock_litres = ?, updated_at = ?
           WHERE fuel_station_id = ? AND fuel_type = ?`;
      const params = supportsLastRefilledAt
        ? [stock_litres, updatedAt, updatedAt, fuel_station_id, fuel_type]
        : [stock_litres, updatedAt, fuel_station_id, fuel_type];

      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });

    if (result.changes === 0) {
      return NextResponse.json(
        { success: false, error: `Stock record for ${fuel_type} not found` },
        { status: 404 }
      );
    }

    // Log in fuel station ledger
    db.run(
      `INSERT INTO fuel_station_ledger (
        fuel_station_id, transaction_type, amount, description,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fuel_station_id,
        "stock_update",
        0,
        `Stock updated for ${fuel_type}: ${stock_litres} litres`,
        "completed",
        updatedAt,
        updatedAt,
      ],
      (err) => {
        if (err) console.error("Ledger log error:", err);
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: "Stock updated successfully",
        fuel_type,
        stock_litres,
        updated_at: updatedAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Update stock error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Decrease stock when order is fulfilled
export async function POST(request) {
  try {
    const body = await request.json();
    const { fuel_station_id, fuel_type, litres_picked_up } = body || {};

    if (!fuel_station_id || !fuel_type || !litres_picked_up) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: fuel_station_id, fuel_type, litres_picked_up" },
        { status: 400 }
      );
    }

    if (typeof litres_picked_up !== "number" || litres_picked_up <= 0) {
      return NextResponse.json(
        { success: false, error: "litres_picked_up must be a positive number" },
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

    // Check current stock
    const stock = await new Promise((resolve) => {
      db.get(
        `SELECT stock_litres FROM fuel_station_stock
         WHERE fuel_station_id = ? AND fuel_type = ?`,
        [fuel_station_id, fuel_type],
        (err, row) => resolve(row || null)
      );
    });

    if (!stock) {
      return NextResponse.json(
        { success: false, error: `Stock record for ${fuel_type} not found` },
        { status: 404 }
      );
    }

    if (stock.stock_litres < litres_picked_up) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient stock. Available: ${stock.stock_litres}L, Requested: ${litres_picked_up}L`
        },
        { status: 400 }
      );
    }

    // Update stock (decrease)
    const result = await new Promise((resolve, reject) => {
      db.run(
        `UPDATE fuel_station_stock 
         SET stock_litres = stock_litres - ?, updated_at = ?
         WHERE fuel_station_id = ? AND fuel_type = ?`,
        [litres_picked_up, updatedAt, fuel_station_id, fuel_type],
        function (err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });

    return NextResponse.json(
      {
        success: true,
        message: "Stock decreased successfully",
        fuel_type,
        litres_picked_up,
        remaining_stock: stock.stock_litres - litres_picked_up,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Decrease stock error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
