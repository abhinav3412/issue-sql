import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");

/**
 * GET /api/admin/settlements
 * List all settlements with optional filters
 * Query params: worker_id, fuel_station_id, status, start_date, end_date, limit, offset
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const workerId = url.searchParams.get("worker_id");
    const fuelStationId = url.searchParams.get("fuel_station_id");
    const status = url.searchParams.get("status");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const offset = Number(url.searchParams.get("offset")) || 0;

    const db = getDB();

    // Ensure settlements table exists
    await ensureSettlementsTable(db);

    let sql = `
      SELECT 
        s.*,
        w.first_name as worker_first_name,
        w.last_name as worker_last_name,
        w.email as worker_email,
        fs.name as fuel_station_name,
        sr.status as request_status,
        sr.user_id as customer_id
      FROM settlements s
      LEFT JOIN workers w ON s.worker_id = w.id
      LEFT JOIN fuel_stations fs ON s.fuel_station_id = fs.id
      LEFT JOIN service_requests sr ON s.service_request_id = sr.id
    `;

    const params = [];
    const conditions = [];

    if (workerId) {
      conditions.push("s.worker_id = ?");
      params.push(Number(workerId));
    }

    if (fuelStationId) {
      conditions.push("s.fuel_station_id = ?");
      params.push(Number(fuelStationId));
    }

    if (status) {
      conditions.push("s.status = ?");
      params.push(status);
    }

    if (startDate) {
      conditions.push("s.settlement_date >= ?");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("s.settlement_date <= ?");
      params.push(endDate);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY s.settlement_date DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const settlements = await new Promise((resolve) => {
      db.all(sql, params, (err, rows) => {
        resolve(rows || []);
      });
    });

    // Get total count
    let countSql = "SELECT COUNT(*) as count FROM settlements s";
    const countParams = [];
    const countConditions = [];

    if (workerId) {
      countConditions.push("s.worker_id = ?");
      countParams.push(Number(workerId));
    }
    if (fuelStationId) {
      countConditions.push("s.fuel_station_id = ?");
      countParams.push(Number(fuelStationId));
    }
    if (status) {
      countConditions.push("s.status = ?");
      countParams.push(status);
    }
    if (startDate) {
      countConditions.push("s.settlement_date >= ?");
      countParams.push(startDate);
    }
    if (endDate) {
      countConditions.push("s.settlement_date <= ?");
      countParams.push(endDate);
    }

    if (countConditions.length > 0) {
      countSql += " WHERE " + countConditions.join(" AND ");
    }

    const countResult = await new Promise((resolve) => {
      db.get(countSql, countParams, (err, row) => {
        resolve(row || { count: 0 });
      });
    });

    return NextResponse.json({
      success: true,
      settlements,
      pagination: {
        limit,
        offset,
        total: countResult.count,
        has_more: offset + limit < countResult.count,
      },
    });
  } catch (err) {
    console.error("Get settlements error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve settlements" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/settlements/reconcile
 * Mark a settlement as reconciled
 * Body: { settlement_id }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { settlement_id, notes } = body;

    if (!settlement_id) {
      return NextResponse.json(
        { error: "settlement_id is required" },
        { status: 400 }
      );
    }

    const db = getDB();
    await ensureSettlementsTable(db);

    const now = getLocalDateTimeString();

    // Update settlement status
    await new Promise((resolve) => {
      db.run(
        "UPDATE settlements SET status = 'reconciled', notes = ?, updated_at = ? WHERE id = ?",
        [notes || null, now, settlement_id],
        (err) => {
          if (err) console.error("Update settlement error:", err);
          resolve();
        }
      );
    });

    return NextResponse.json({
      success: true,
      message: "Settlement marked as reconciled",
    });
  } catch (err) {
    console.error("Reconcile settlement error:", err);
    return NextResponse.json(
      { error: "Failed to reconcile settlement" },
      { status: 500 }
    );
  }
}

/**
 * Get settlement summary statistics
 * GET /api/admin/settlements/summary
 */
export async function getSummary(request) {
  try {
    const db = getDB();
    await ensureSettlementsTable(db);

    // Get totals for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split("T")[0];

    const summary = await new Promise((resolve) => {
      db.get(
        `SELECT
          COUNT(*) as total_settlements,
          SUM(customer_amount) as total_customer_amount,
          SUM(fuel_station_payout) as total_fuel_station_payout,
          SUM(worker_payout) as total_worker_payout,
          SUM(platform_profit) as total_platform_profit,
          AVG(platform_profit) as avg_platform_profit,
          MIN(platform_profit) as min_platform_profit,
          MAX(platform_profit) as max_platform_profit
        FROM settlements
        WHERE settlement_date >= ?`,
        [dateStr],
        (err, row) => {
          resolve(row || {});
        }
      );
    });

    return NextResponse.json({
      success: true,
      period: "last_30_days",
      summary,
    });
  } catch (err) {
    console.error("Get summary error:", err);
    return NextResponse.json(
      { error: "Failed to get summary" },
      { status: 500 }
    );
  }
}

/**
 * Ensure settlements table exists
 */
function ensureSettlementsTable(db) {
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_request_id INTEGER,
        worker_id INTEGER,
        fuel_station_id INTEGER,
        settlement_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        customer_amount INTEGER NOT NULL,
        fuel_cost INTEGER NOT NULL,
        delivery_fee INTEGER NOT NULL,
        platform_service_fee INTEGER NOT NULL,
        surge_fee INTEGER DEFAULT 0,
        
        fuel_station_payout INTEGER NOT NULL,
        worker_payout REAL NOT NULL,
        platform_profit INTEGER NOT NULL,
        
        worker_base_pay REAL DEFAULT 0,
        worker_distance_km REAL DEFAULT 0,
        worker_distance_pay REAL DEFAULT 0,
        worker_surge_bonus REAL DEFAULT 0,
        worker_waiting_time_bonus REAL DEFAULT 0,
        worker_incentive_bonus REAL DEFAULT 0,
        worker_penalty REAL DEFAULT 0,
        worker_minimum_guarantee REAL DEFAULT 0,
        
        status VARCHAR(30) DEFAULT 'calculated',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (service_request_id) REFERENCES service_requests(id),
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id)
      )`,
      (err) => {
        if (err && !/already exists/i.test(err.message)) {
          console.error("Create settlements table failed:", err);
        }
        resolve();
      }
    );
  });
}
