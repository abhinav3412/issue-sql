import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

export async function GET() {
  try {
    const db = getDB();
    const users = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, email, first_name, last_name, phone_number, role, created_at
         FROM users
         WHERE role IN ('User', 'Admin')
           AND NOT EXISTS (
             SELECT 1 FROM fuel_stations fs WHERE fs.user_id = users.id
           )
         ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows ?? []);
        }
      );
    });
    return NextResponse.json(users);
  } catch (err) {
    console.error("Admin users list error:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
