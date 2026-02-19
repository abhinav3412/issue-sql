import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");
const bcrypt = require("bcryptjs");

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      station_name,
      email,
      phone_number,
      address,
      latitude,
      longitude,
      password,
    } = body || {};

    // Validate required fields
    if (
      !station_name ||
      !email ||
      !phone_number ||
      !address ||
      latitude === undefined ||
      latitude === null ||
      longitude === undefined ||
      longitude === null ||
      !password
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: station_name, email, phone_number, address, latitude, longitude, password"
        },
        { status: 400 }
      );
    }

    // Validate coordinates
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid coordinates" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const db = getDB();
    const createdAt = getLocalDateTimeString();

    // Start transaction-like behavior (SQLite)
    try {
      // 1. Create user account with Fuel_Station role
      const insertStationUser = (role) => new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO users (email, password, first_name, last_name, phone_number, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [email, hashedPassword, station_name, "Station", phone_number, role, createdAt, createdAt],
          function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
          }
        );
      });

      let userResult;
      try {
        userResult = await insertStationUser("Station");
      } catch (err) {
        // Backward compatibility: some older DBs only allow User/Admin in users.role.
        if (String(err?.message || "").includes("role IN ('User', 'Admin')")) {
          userResult = await insertStationUser("User");
        } else {
          throw err;
        }
      }

      // 2. Create fuel station profile
      const fuelStationResult = await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO fuel_stations (
            user_id, station_name, email, phone_number, address,
            latitude, longitude, cod_enabled, is_verified, is_open,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?)`,
          [
            userResult.id,
            station_name,
            email,
            phone_number,
            address,
            latitude,
            longitude,
            createdAt,
            createdAt,
          ],
          function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
          }
        );
      });

      // 3. Initialize stock for petrol and diesel
      const fuelTypes = ["petrol", "diesel"];
      for (const fuelType of fuelTypes) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO fuel_station_stock (fuel_station_id, fuel_type, stock_litres, created_at, updated_at)
             VALUES (?, ?, 0, ?, ?)`,
            [fuelStationResult.id, fuelType, createdAt, createdAt],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      // Log activity
      db.run(
        `INSERT INTO activity_log (type, message, entity_type, entity_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        ["fuel_station_created", `Fuel station ${station_name} created`, "Station", fuelStationResult.id, createdAt],
        (err) => {
          if (err) console.error("Activity log error:", err);
        }
      );

      return NextResponse.json(
        {
          success: true,
          message: "Fuel station account created successfully",
          fuel_station_id: fuelStationResult.id,
          user_id: userResult.id,
        },
        { status: 201 }
      );
    } catch (err) {
      if (err && typeof err.message === "string" && err.message.includes("UNIQUE")) {
        return NextResponse.json(
          { success: false, error: "Email already exists" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    console.error("Fuel station signup error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
