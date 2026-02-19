import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");
const { generateToken } = require("../../../../database/auth-middleware");
const bcrypt = require("bcryptjs");

export async function POST(request) {
  try {
    const body = await request.json();
    const { role, email, password } = body || {};

    if (!email || !password || !role) {
      return NextResponse.json(
        { success: false, error: "Missing email, password, or role" },
        { status: 400 }
      );
    }

    const db = getDB();
    
    // Route to appropriate table based on role
    let user = null;
    let userRole = role;

    switch (role) {
      case "Worker":
        user = await new Promise((resolve) => {
          db.get(
            "SELECT id, email, password, first_name, last_name, phone_number, status FROM workers WHERE email = ?",
            [email],
            (err, row) => resolve(row || null)
          );
        });
        if (user) userRole = "Worker";
        break;

      case "Fuel_Station":
        // Check fuel_stations table
        const fuelStationUser = await new Promise((resolve) => {
          db.get(
            `SELECT fs.id as fs_id, u.id, u.password, u.email, u.first_name, u.last_name, u.phone_number, u.role,
                    fs.station_name, fs.is_verified, fs.cod_enabled
             FROM fuel_stations fs
             JOIN users u ON fs.user_id = u.id
             WHERE u.email = ?`,
            [email],
            (err, row) => resolve(row || null)
          );
        });
        if (fuelStationUser) {
          user = fuelStationUser;
          userRole = "Fuel_Station";
        }
        break;

      case "Admin":
      case "User":
      default:
        user = await new Promise((resolve) => {
          db.get(
            "SELECT id, email, password, first_name, last_name, phone_number, role FROM users WHERE email = ?",
            [email],
            (err, row) => resolve(row || null)
          );
        });
        if (user && role === "Admin" && user.role !== "Admin") {
          return NextResponse.json(
            { success: false, error: "You are not an admin" },
            { status: 403 }
          );
        }
        userRole = user?.role || "User";
        break;
    }

    if (!user) {
      return NextResponse.json(
        { 
          success: false, 
          error: "No account found for this email and role. Please sign up first." 
        },
        { status: 401 }
      );
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, error: "Incorrect password." },
        { status: 401 }
      );
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: userRole,
    });

    // Log login activity
    const activityMessage = `${userRole} login`;
    db.run(
      `INSERT INTO activity_log (type, message, entity_type, entity_id) VALUES (?, ?, ?, ?)`,
      ["login", activityMessage, userRole, user.id],
      (err) => {
        if (err) console.error("Activity log error:", err);
      }
    );

    return NextResponse.json(
      {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          role: userRole,
          first_name: user.first_name,
          last_name: user.last_name,
          phone_number: user.phone_number || "",
          ...(userRole === "Fuel_Station" && {
            station_name: user.station_name,
            is_verified: user.is_verified,
            cod_enabled: user.cod_enabled,
          }),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
