import { NextResponse } from "next/server";
const { getDB, getUTCDateTimeString } = require("../../../database/db");
const bcrypt = require("bcryptjs");

function ensurePasswordResetsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        token VARCHAR(128) NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
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
        message VARCHAR(500) NOT NULL,
        entity_type VARCHAR(20),
        entity_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const token = body?.token && String(body.token).trim();
    const newPassword = body?.password && String(body.password);
    if (!token || !newPassword) {
      return NextResponse.json({ error: "Token and new password are required" }, { status: 400 });
    }

    const db = getDB();
    await ensurePasswordResetsTable(db);

    // Find reset row
    const row = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM password_resets WHERE token = ?", [token], (err, r) => {
        if (err) reject(err);
        else resolve(r || null);
      });
    });

    if (!row) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    if (row.used) {
      return NextResponse.json({ error: "Token already used" }, { status: 400 });
    }

    // Check expiry: allow 24 hours
    try {
      // created_at is "YYYY-MM-DD HH:MM:SS" in UTC
      // Append 'Z' to ensure it's parsed as UTC
      const createdAtStr = String(row.created_at).replace(" ", "T") + "Z";
      const created = new Date(createdAtStr);
      const age = Date.now() - created.getTime();

      if (isNaN(created.getTime()) || age > 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Token expired" }, { status: 400 });
      }
    } catch (e) {
      console.error("Token expiry parse error:", e);
      return NextResponse.json({ error: "Error validating token" }, { status: 400 });
    }

    // Hash password and update user
    const hashed = await bcrypt.hash(newPassword, 10);

    await new Promise((resolve, reject) => {
      db.run("UPDATE users SET password = ? WHERE id = ?", [hashed, row.user_id], (err) => (err ? reject(err) : resolve()));
    });

    // Mark token used
    await new Promise((resolve, reject) => {
      db.run("UPDATE password_resets SET used = 1 WHERE id = ?", [row.id], (err) => (err ? reject(err) : resolve()));
    });

    // Log activity (optional)
    await ensureActivityLogTable(db);
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO activity_log (type, message, created_at) VALUES (?, ?, ?)",
        ["password_reset", `Password reset for user ${row.user_id}`, getUTCDateTimeString()],
        (err) => (err ? reject(err) : resolve())
      );
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
