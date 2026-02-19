import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");
const { requireAdmin, errorResponse } = require("../../../../database/auth-middleware");

export async function GET() {
  try {
    const db = getDB();
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
    const workers = await new Promise((resolve, reject) => {
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
    return NextResponse.json(workers);
  } catch (err) {
    console.error("Admin workers list error:", err);
    return NextResponse.json({ error: "Failed to load workers" }, { status: 500 });
  }
}



