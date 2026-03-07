import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../database/db");
const bcrypt = require("bcryptjs");
const { validatePhoneByCountry } = require("../../signup/phoneValidation");

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      role,
      firstName,
      lastName,
      email,
      countryIso2,
      countryDial,
      phone,
      password,
    } = body || {};

    if (
      !role ||
      !firstName ||
      !lastName ||
      !email ||
      !countryIso2 ||
      !countryDial ||
      !phone ||
      !password
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const dialDigits = String(countryDial).replace(/\D/g, "");
    let nationalNumber = String(phone || "");
    if (dialDigits) {
      const dialRegex = new RegExp(`^\\+?${dialDigits}`);
      nationalNumber = nationalNumber.replace(dialRegex, "");
    }

    const phoneCheck = validatePhoneByCountry({
      countryIso2,
      dialCode: countryDial,
      nationalNumber,
    });

    if (!phoneCheck.valid) {
      return NextResponse.json({ error: phoneCheck.message }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const db = getDB();

    const isWorker = role === "Worker";
    const table = isWorker ? "workers" : "users";

    const createdAt = getLocalDateTimeString();
    const sql = isWorker
      ? "INSERT INTO workers (email, password, first_name, last_name, phone_number, status, created_at) VALUES (?, ?, ?, ?, ?, 'Available', ?)"
      : "INSERT INTO users (email, password, first_name, last_name, phone_number, role, created_at) VALUES (?, ?, ?, ?, ?, 'User', ?)";

    const params = [email, hashedPassword, firstName, lastName, phoneCheck.fullPhone, createdAt];

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
    const message = String(err?.message || "");
    const isDuplicateEmail =
      err?.code === "23505" ||
      err?.code === "ER_DUP_ENTRY" ||
      err?.errno === 1062 ||
      /unique constraint|duplicate key|\bunique\b/i.test(message);

    if (isDuplicateEmail) {
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

