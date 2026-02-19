import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../database/db");
const bcrypt = require("bcryptjs");

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      role,
      firstName,
      lastName,
      email,
      phone,
      password,
    } = body || {};

    if (
      !role ||
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !password
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const db = getDB();

    const isWorker = role === "Worker";
    const table = isWorker ? "workers" : "users";

    const createdAt = getLocalDateTimeString();
    const sql = isWorker
      ? "INSERT INTO workers (email, password, first_name, last_name, phone_number, status, created_at) VALUES (?, ?, ?, ?, ?, 'Available', ?)"
      : "INSERT INTO users (email, password, first_name, last_name, phone_number, role, created_at) VALUES (?, ?, ?, ?, ?, 'User', ?)";

    const params = [email, hashedPassword, firstName, lastName, phone, createdAt];

    const result = await new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) {
          return reject(err);
        }
        resolve({ id: this.lastID });
      });
    });

    const { generateToken } = require("../../../database/auth-middleware");
    const token = generateToken({
      id: result.id,
      email: email,
      role: isWorker ? "Worker" : "User"
    });

    return NextResponse.json(
      {
        success: true,
        id: result.id,
        type: isWorker ? "worker" : "user",
        token: token
      },
      { status: 201 }
    );
  } catch (err) {
    if (err && typeof err.message === "string" && err.message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }

    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

