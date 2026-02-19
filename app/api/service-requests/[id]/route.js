import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");

function ensureServiceRequestsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS service_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        vehicle_number VARCHAR(50) NOT NULL,
        driving_licence VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        service_type VARCHAR(50) NOT NULL,
        amount INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_lat REAL,
        user_lon REAL,
        assigned_worker INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function ensureActivityLogTable(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type VARCHAR(50) NOT NULL,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export async function PATCH(request, context) {
  try {
    const resolvedParams = context?.params ? await context.params : null;
    // params may be undefined in some dev/runtime contexts — fall back to parsing the URL
    const id = (() => {
      if (resolvedParams && resolvedParams.id) {
        const n = Number(resolvedParams.id);
        if (!Number.isNaN(n)) return n;
      }
      try {
        const url = request.url ? new URL(request.url) : null;
        const parts = url?.pathname?.split("/").filter(Boolean) || [];
        const last = parts[parts.length - 1];
        const n = Number(last);
        if (!Number.isNaN(n)) return n;
      } catch (e) {
        // ignore and fall through
      }
      return NaN;
    })();
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
    }

    let body = null;
    try {
      body = await request.json();
    } catch (err) {
      // If parsing fails, capture raw text for debugging
      try {
        const txt = await request.text();
        console.warn("Failed to parse JSON body, raw text:", txt);
      } catch (e) { }
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { status } = body || {};

    const validStatuses = ["Pending", "Assigned", "In Progress", "Completed", "Cancelled"];
    // Debug: log incoming body for troubleshooting
    try {
      console.log("[service-requests PATCH] incoming body:", body);
    } catch (e) { }
    // Accept case-insensitive input and normalize to canonical casing
    if (!status || typeof status !== "string") {
      console.warn("[service-requests PATCH] missing or invalid 'status' field", body);
      return NextResponse.json({ error: `Status is required` }, { status: 400 });
    }
    const statusLower = status.trim().toLowerCase();
    const matchIndex = validStatuses.findIndex((s) => s.toLowerCase() === statusLower);
    if (matchIndex === -1) {
      console.warn("[service-requests PATCH] invalid status value", status);
      return NextResponse.json({ error: `Status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }
    const normalizedStatus = validStatuses[matchIndex];
    console.log("[service-requests PATCH] normalizedStatus:", normalizedStatus);

    const db = getDB();
    await ensureServiceRequestsTable(db);
    await ensureActivityLogTable(db);

    // Get current request to log activity
    const currentRequest = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM service_requests WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!currentRequest) {
      return NextResponse.json(
        { error: "Service request not found" },
        { status: 404 }
      );
    }

    // Update the status
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE service_requests SET status = ? WHERE id = ?",
        [normalizedStatus, id],
        (err) => (err ? reject(err) : resolve())
      );
    });

    // Log the activity
    const message = `Service request ${id} status updated to ${normalizedStatus}`;
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO activity_log (type, message, created_at) VALUES (?, ?, ?)",
        ["service_request_updated", message, getLocalDateTimeString()],
        (err) => (err ? reject(err) : resolve())
      );
    });

    return NextResponse.json({
      success: true,
      message: `Service request status updated to ${status}`,
    });
  } catch (err) {
    console.error("Service request update error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
