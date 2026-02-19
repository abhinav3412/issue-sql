import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function ensureAdminWorkersSchema(db) {
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS worker_bank_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER NOT NULL UNIQUE,
        account_holder_name TEXT,
        account_number TEXT,
        ifsc_code TEXT,
        bank_name TEXT,
        is_bank_verified INTEGER DEFAULT 0,
        razorpay_contact_id TEXT,
        razorpay_fund_account_id TEXT,
        rejection_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export async function GET() {
  try {
    const db = getDB();
    await ensureAdminWorkersSchema(db);
    await new Promise((resolve) => {
      db.run("ALTER TABLE workers ADD COLUMN verified INTEGER DEFAULT 0", (err) => resolve());
    });
    await new Promise((resolve) => {
      db.run("ALTER TABLE workers ADD COLUMN lock_reason TEXT", (err) => resolve());
    });
    // Ensure rating columns in service_requests
    await new Promise((resolve) => {
      db.run("ALTER TABLE service_requests ADD COLUMN rating INTEGER", (err) => resolve());
    });
    await new Promise((resolve) => {
      db.run("ALTER TABLE service_requests ADD COLUMN review_comment TEXT", (err) => resolve());
    });
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT w.*, 
                bd.is_bank_verified,
                (SELECT AVG(rating) FROM service_requests WHERE assigned_worker = w.id AND rating IS NOT NULL) as avg_rating
         FROM workers w
         LEFT JOIN worker_bank_details bd ON w.id = bd.worker_id
         ORDER BY w.created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows ?? []);
        }
      );
    });

    const workers = (rows || []).map((w) => ({
      ...w,
      avg_rating: w.avg_rating == null ? null : toNumber(w.avg_rating, 0),
      pending_balance: toNumber(w.pending_balance, 0),
      floater_cash: toNumber(w.floater_cash, 0),
      is_bank_verified: toNumber(w.is_bank_verified, 0),
      verified: toNumber(w.verified, 0),
      status_locked: toNumber(w.status_locked, 0),
    }));

    return NextResponse.json(workers);
  } catch (err) {
    console.error("Admin workers list error:", err);
    return NextResponse.json({ error: "Failed to load workers" }, { status: 500 });
  }
}
