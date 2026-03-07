import { NextResponse } from "next/server";
const { getDB, getUTCDateTimeString } = require("../../../database/db");
const bcrypt = require("bcryptjs");

function ensurePasswordResetsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        account_type VARCHAR(20) DEFAULT 'users',
        account_id INTEGER,
        token VARCHAR(128) NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        consumed_at DATETIME
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function addColumnIfMissing(db, columnSql) {
  return new Promise((resolve) => {
    db.run(`ALTER TABLE password_resets ADD COLUMN ${columnSql}`, (err) => {
      if (err && !/duplicate column|already exists/i.test(String(err.message || ""))) {
        console.error(`Failed adding column ${columnSql}:`, err);
      }
      resolve();
    });
  });
}

async function ensurePasswordResetsColumns(db) {
  await addColumnIfMissing(db, "account_type VARCHAR(20) DEFAULT 'users'");
  await addColumnIfMissing(db, "account_id INTEGER");
  await addColumnIfMissing(db, "consumed_at DATETIME");
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

function parseCreatedAt(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes("T")
    ? raw
    : raw.replace(" ", "T");
  const withTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
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
    await ensurePasswordResetsColumns(db);

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
      const created = parseCreatedAt(row.created_at);
      if (!created) {
        return NextResponse.json({ error: "Error validating token" }, { status: 400 });
      }
      const age = Date.now() - created.getTime();

      if (age > 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Token expired" }, { status: 400 });
      }
    } catch (e) {
      console.error("Token expiry parse error:", e);
      return NextResponse.json({ error: "Error validating token" }, { status: 400 });
    }

    // Hash password and update user
    const hashed = await bcrypt.hash(newPassword, 10);
    const accountType = String(row.account_type || "users").toLowerCase();
    const accountId = row.account_id || row.user_id;
    const targetTable = accountType === "workers" ? "workers" : "users";
    if (!accountId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    await new Promise((resolve, reject) => {
      db.run(`UPDATE ${targetTable} SET password = ? WHERE id = ?`, [hashed, accountId], (err) => (err ? reject(err) : resolve()));
    });

    // Mark token used
    await new Promise((resolve, reject) => {
      db.run("UPDATE password_resets SET used = 1, consumed_at = ? WHERE id = ?", [getUTCDateTimeString(), row.id], (err) => (err ? reject(err) : resolve()));
    });

    // Log activity (optional)
    await ensureActivityLogTable(db);
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO activity_log (type, message, created_at) VALUES (?, ?, ?)",
        ["password_reset", `Password reset for ${targetTable} ${accountId}`, getUTCDateTimeString()],
        (err) => (err ? reject(err) : resolve())
      );
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
