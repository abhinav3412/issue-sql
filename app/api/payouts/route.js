// API Route for Worker Payouts and Settlements
import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../database/db");

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const summary = searchParams.get("summary");
    const worker_id = searchParams.get("worker_id");
    const db = getDB();

    // Ensure worker_payouts table exists
    await new Promise((resolve) => {
      db.run(`CREATE TABLE IF NOT EXISTS worker_payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        reference_id VARCHAR(100),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (worker_id) REFERENCES workers(id)
      )`, (err) => resolve());
    });

    // Ensure settlements table exists (needed for the join)
    await new Promise((resolve) => {
      db.run(`CREATE TABLE IF NOT EXISTS settlements (
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => resolve());
    });

    if (summary === "true") {
      // Admin view: List all workers with their balances
      // Calculates lifetime earnings from settlements and subtracts total payouts
      const sql = `
        SELECT 
          w.id, w.first_name, w.last_name, w.phone_number, w.service_type,
          COALESCE(SUM(s.worker_payout), 0) as lifetime_earnings,
          COALESCE(MAX(p.total_paid), 0) as total_paid
        FROM workers w
        LEFT JOIN settlements s ON w.id = s.worker_id
        LEFT JOIN (
          SELECT worker_id, SUM(amount) as total_paid FROM worker_payouts GROUP BY worker_id
        ) p ON w.id = p.worker_id
        GROUP BY w.id
      `;
      const rows = await new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      return NextResponse.json(rows);
    } else if (worker_id) {
      // Worker view: List payouts for specific worker
      const sql = `SELECT * FROM worker_payouts WHERE worker_id = ? ORDER BY created_at DESC`;
      const rows = await new Promise((resolve, reject) => {
        db.all(sql, [worker_id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      return NextResponse.json(rows);
    }
    
    return NextResponse.json([]);
  } catch (err) {
    console.error("Payouts API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { worker_id, amount, reference_id, notes } = body;
    
    if (!worker_id || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = getDB();
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO worker_payouts (worker_id, amount, reference_id, notes, created_at) VALUES (?, ?, ?, ?, ?)`,
        [worker_id, amount, reference_id || null, notes || null, getLocalDateTimeString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Payout Creation Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
