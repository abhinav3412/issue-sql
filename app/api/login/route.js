import { NextResponse } from "next/server";
const { getDB } = require("../../../database/db");
const bcrypt = require("bcryptjs");

async function ensureAuthTables(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20),
      driving_licence VARCHAR(100),
      role VARCHAR(20) DEFAULT 'User',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20),
      status VARCHAR(20) DEFAULT 'Available',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS fuel_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      station_name VARCHAR(255),
      is_verified INTEGER DEFAULT 0,
      cod_enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type VARCHAR(50) NOT NULL,
      message TEXT,
      entity_type VARCHAR(50),
      entity_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  for (const sql of statements) {
    await new Promise((resolve, reject) => {
      db.run(sql, (err) => (err ? reject(err) : resolve()));
    });
  }
}

function ensureUserProfileColumns(db) {
  const cols = ["driving_licence VARCHAR(100)"];
  return Promise.all(
    cols.map(
      (col) =>
        new Promise((resolve) => {
          db.run(`ALTER TABLE users ADD COLUMN ${col}`, (err) => {
            if (err && !/duplicate column name|already exists/i.test(err.message)) {
              console.error(`Add users.${col} failed:`, err);
            }
            resolve();
          });
        })
    )
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { role, email, password } = body || {};

    if (!email || !password || !role) {
      return NextResponse.json(
        { error: "Missing email, password, or role" },
        { status: 400 }
      );
    }

    const db = getDB();
    await ensureAuthTables(db);
    const isWorker = role === "Worker";
    const isAdmin = role === "Admin";

    const table = isWorker ? "workers" : "users";
    if (!isWorker) {
      await ensureUserProfileColumns(db);
    }

    const sql = isWorker
      ? "SELECT id, email, password, first_name, last_name, phone_number, status FROM workers WHERE email = ?"
      : "SELECT id, email, password, first_name, last_name, phone_number, role, driving_licence FROM users WHERE email = ?";

    const user = await new Promise((resolve, reject) => {
      db.get(sql, [email], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row || null);
      });
    });

    if (!user) {
      return NextResponse.json(
        { error: "No account found for this email and role. Please sign up first." },
        { status: 401 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Incorrect password." },
        { status: 401 }
      );
    }

    if (isAdmin && user.role !== "Admin") {
      return NextResponse.json(
        { error: "You are not an admin" },
        { status: 403 }
      );
    }

    const { generateToken } = require("../../../database/auth-middleware");

    // Determine the final role and ID.
    let finalId = user.id;
    let finalRole = isWorker ? "Worker" : (user.role || "User");

    // If role explicitly requests Station, map to linked fuel station.
    let stationInfo = null;
    if (!isWorker && role === "Station") {
      stationInfo = await new Promise((resolve) => {
        db.get(
          "SELECT id, station_name, is_verified, cod_enabled FROM fuel_stations WHERE user_id = ?",
          [user.id],
          (err, row) => resolve(row || null)
        );
      });
      if (stationInfo) {
        finalId = stationInfo.id;
        finalRole = "Station";
      }
    }

    const token = generateToken({
      id: finalId,
      email: user.email,
      role: finalRole
    });

    return NextResponse.json(
      {
        success: true,
        id: finalId,
        role: finalRole,
        first_name: user.first_name,
        last_name: user.last_name,
        phone_number: user.phone_number || "",
        driving_licence: user.driving_licence || "",
        station_name: stationInfo?.station_name,
        is_verified: stationInfo?.is_verified,
        cod_enabled: stationInfo?.cod_enabled,
        token: token
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
