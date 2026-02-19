import { NextResponse } from "next/server";
const { getDB } = require("../../../database/db");
const bcrypt = require("bcryptjs");

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

    // Determine the final role and ID. For Station managers, we use their station ID.
    let finalId = user.id;
    let finalRole = isWorker ? "Worker" : (user.role || "User");

    // If not a worker, check if this user is linked to a fuel station
    let stationInfo = null;
    if (!isWorker) {
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
