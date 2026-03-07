import { NextResponse } from "next/server";
const { getDB } = require("../../../../../database/db");

/**
 * GET /api/admin/settlements/summary
 * Get settlement summary statistics
 * Query params: days (default: 30)
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days")) || 30;

    const db = getDB();

    // Ensure settlements table exists
    await ensureSettlementsTable(db);

    // Get totals for specified days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const dateStr = startDate.toISOString().split("T")[0];

    const summary = await new Promise((resolve) => {
      db.get(
        `SELECT
          COUNT(*) as total_settlements,
          COUNT(DISTINCT worker_id) as total_workers,
          COUNT(DISTINCT fuel_station_id) as total_fuel_stations,
          SUM(customer_amount) as total_customer_amount,
          SUM(fuel_station_payout) as total_fuel_station_payout,
          SUM(worker_payout) as total_worker_payout,
          SUM(platform_profit) as total_platform_profit,
          ROUND(AVG(platform_profit), 2) as avg_platform_profit,
          MIN(platform_profit) as min_platform_profit,
          MAX(platform_profit) as max_platform_profit,
          ROUND(SUM(platform_profit) / SUM(customer_amount) * 100, 2) as avg_profit_margin_percentage
        FROM settlements
        WHERE settlement_date >= ?`,
        [dateStr],
        (err, row) => {
          resolve(row || {});
        }
      );
    });

    // Get worker payouts summary
    const workerSummary = await new Promise((resolve) => {
      db.all(
        `SELECT
          w.id,
          w.first_name,
          w.last_name,
          COUNT(*) as deliveries,
          SUM(s.worker_payout) as total_earnings,
          ROUND(AVG(s.worker_payout), 2) as avg_per_delivery,
          SUM(s.worker_base_pay) as base_pay_total,
          SUM(s.worker_distance_pay) as distance_pay_total,
          SUM(s.worker_surge_bonus) as surge_bonus_total,
          SUM(s.worker_incentive_bonus) as incentive_bonus_total
        FROM settlements s
        LEFT JOIN workers w ON s.worker_id = w.id
        WHERE s.settlement_date >= ? AND s.worker_id IS NOT NULL
        GROUP BY w.id
        ORDER BY total_earnings DESC`,
        [dateStr],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });

    // Get fuel station revenue summary
    const fuelStationSummary = await new Promise((resolve) => {
      db.all(
        `SELECT
          fs.id,
          fs.name,
          COUNT(*) as orders,
          SUM(s.fuel_station_payout) as total_payout,
          ROUND(AVG(s.fuel_cost), 2) as avg_fuel_cost,
          SUM(s.customer_amount) as total_customer_amount
        FROM settlements s
        LEFT JOIN fuel_stations fs ON s.fuel_station_id = fs.id
        WHERE s.settlement_date >= ? AND s.fuel_station_id IS NOT NULL
        GROUP BY fs.id
        ORDER BY total_payout DESC`,
        [dateStr],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });

    return NextResponse.json({
      success: true,
      period: {
        days,
        start_date: dateStr,
        end_date: new Date().toISOString().split("T")[0],
      },
      summary,
      worker_summary: workerSummary,
      fuel_station_summary: fuelStationSummary,
    });
  } catch (err) {
    console.error("Get summary error:", err);
    return NextResponse.json(
      { error: "Failed to get summary", details: err.message },
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
