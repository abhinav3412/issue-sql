import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../database/db");

function isDuplicateColumnError(err) {
  return /duplicate column name|already exists|42701|ER_DUP_FIELDNAME/i.test(String(err?.message || ""));
}

async function ensureWorkersSchema(db) {
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20),
        status VARCHAR(20) DEFAULT 'Available',
        service_type VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  const cols = [
    "service_type VARCHAR(50)",
    "latitude REAL",
    "longitude REAL",
    "verified INTEGER DEFAULT 0",
    "status_locked INTEGER DEFAULT 0",
    "floater_cash REAL DEFAULT 0.0",
    "last_cash_collection_at DATETIME",
    "lock_reason TEXT",
    "license_photo TEXT",
    "self_photo TEXT",
    "docs_submitted_at DATETIME",
  ];

  for (const col of cols) {
    await new Promise((resolve) => {
      db.run(`ALTER TABLE workers ADD COLUMN ${col}`, (err) => {
        if (err && !isDuplicateColumnError(err)) {
          console.error(`Add workers.${col.split(" ")[0]} failed:`, err);
        }
        resolve();
      });
    });
  }
}

/** Returns active workers (Available or Busy) for the user dashboard. */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const workerId = url.searchParams.get("id");
    const db = getDB();
    await ensureWorkersSchema(db);

    // --- NEW: 30-Minute Auto-Verification Logic (FOR TESTING) ---
    // If docs were submitted > 24 hours ago, auto-verify the worker.
    const oneDayAgo = getLocalDateTimeString(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await new Promise((resolve) => {
      db.run(
        `UPDATE workers 
         SET verified = 1 
         WHERE verified = 0 
         AND docs_submitted_at IS NOT NULL 
         AND docs_submitted_at < ?`,
        [oneDayAgo],
        (err) => {
          if (err) console.error("Auto-verification failed:", err);
          resolve();
        }
      );
    });

    // Enforcement Check for ALL workers (periodically or on access)
    // If floater_cash >= 1500 or > 7 days since last collection/joining, lock them offline
    const sevenDaysAgo = getLocalDateTimeString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    await new Promise((resolve) => {
      db.run(
        `UPDATE workers 
         SET status = 'Offline', status_locked = 1 
         WHERE (floater_cash >= 1500 OR (COALESCE(last_cash_collection_at, created_at) < ?)) 
         AND status_locked = 0`,
        [sevenDaysAgo],
        () => resolve()
      );
    });

    // Do not auto-unlock status here.
    // Lock removal must happen explicitly via admin actions.

    if (workerId) {
      const worker = await new Promise((resolve, reject) => {
        db.get(
          "SELECT id, first_name, last_name, phone_number, status, service_type, status_locked, verified, latitude, longitude, floater_cash, last_cash_collection_at, docs_submitted_at FROM workers WHERE id = ?",
          [workerId],
          (err, row) => (err ? reject(err) : resolve(row))
        );
      });
      return NextResponse.json(worker || { error: "Worker not found" }, { status: worker ? 200 : 404 });
    }

    const workers = await new Promise((resolve, reject) => {
      db.all(
        "SELECT id, first_name, last_name, status, service_type, status_locked, verified, latitude, longitude, floater_cash, last_cash_collection_at, docs_submitted_at FROM workers WHERE status = 'Available' AND verified = 1 ORDER BY first_name, last_name",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows ?? []);
        }
      );
    });
    return NextResponse.json(workers);
  } catch (err) {
    console.error("Workers list error:", err);
    return NextResponse.json({ error: "Failed to load workers" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, service_type, status, latitude, longitude, license_photo, self_photo, submit_docs } = body;

    if (!id) {
      return NextResponse.json({ error: "Worker ID is required" }, { status: 400 });
    }

    const db = getDB();
    await ensureWorkersSchema(db);

    // Fetch current worker state to check for lock
    const currentWorker = await new Promise((resolve, reject) => {
      db.get("SELECT status, status_locked FROM workers WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!currentWorker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    // Prepare updates
    let updateFields = [];
    let params = [];

    if (service_type !== undefined) {
      updateFields.push("service_type = ?");
      params.push(service_type);
    }

    if (latitude !== undefined) {
      const lat = Number(latitude);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        return NextResponse.json({ error: "Invalid latitude" }, { status: 400 });
      }
      updateFields.push("latitude = ?");
      params.push(lat);
    }

    if (longitude !== undefined) {
      const lng = Number(longitude);
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        return NextResponse.json({ error: "Invalid longitude" }, { status: 400 });
      }
      updateFields.push("longitude = ?");
      params.push(lng);
    }

    if (status !== undefined) {
      // Check if status is locked
      if (currentWorker.status_locked) {
        return NextResponse.json({
          error: "Status is locked by Admin. You cannot change your status at this time.",
          locked: true
        }, { status: 403 });
      }

      const validStatuses = ['Available', 'Busy', 'Offline'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      }

      updateFields.push("status = ?");
      params.push(status);
    }

    // --- NEW: Handle Document Submission ---
    if (submit_docs) {
      if (license_photo) {
        updateFields.push("license_photo = ?");
        params.push(license_photo);
      }
      if (self_photo) {
        updateFields.push("self_photo = ?");
        params.push(self_photo);
      }
      updateFields.push("docs_submitted_at = ?");
      params.push(getLocalDateTimeString());
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    params.push(id);
    const sql = `UPDATE workers SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    await new Promise((resolve, reject) => {
      db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Worker update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
