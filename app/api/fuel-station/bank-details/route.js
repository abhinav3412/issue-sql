import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");
const { requireAuth, errorResponse, successResponse } = require("../../../../database/auth-middleware");
const { encrypt, decrypt } = require("../../../utils/encryption");

function ensureFuelStationBankDetailsTable(db) {
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS fuel_station_bank_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fuel_station_id INTEGER NOT NULL UNIQUE,
        account_holder_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        ifsc_code TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        razorpay_contact_id TEXT,
        razorpay_fund_account_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id)
      )`,
      () => resolve()
    );
  });
}

function maskValue(value, keep = 4) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= keep) return "*".repeat(raw.length);
  return `${"*".repeat(raw.length - keep)}${raw.slice(-keep)}`;
}

async function resolveFuelStationId(db, auth) {
  if (!auth) return null;
  const rawId = Number(auth.id);
  if (!Number.isFinite(rawId)) return null;

  // First try direct station id (works when token id is fuel_stations.id)
  const direct = await new Promise((resolve) => {
    db.get("SELECT id FROM fuel_stations WHERE id = ?", [rawId], (err, row) => resolve(row || null));
  });
  if (direct?.id) return Number(direct.id);

  // Fallback: token id may actually be users.id
  if (auth.role === "Station" || auth.role === "Fuel_Station") {
    const byUser = await new Promise((resolve) => {
      db.get("SELECT id FROM fuel_stations WHERE user_id = ?", [rawId], (err, row) => resolve(row || null));
    });
    if (byUser?.id) return Number(byUser.id);
  }

  return null;
}

/** GET fuel station bank details (masked) */
export async function GET(request) {
  const auth = requireAuth(request);
  if (!auth) return errorResponse("Unauthorized", 401);

  const db = getDB();
  await ensureFuelStationBankDetailsTable(db);

  const fuelStationId = await resolveFuelStationId(db, auth);
  if (!fuelStationId) return errorResponse("Unauthorized", 401);

  try {
    const bankDetails = await new Promise((resolve, reject) => {
      db.get(
        "SELECT account_holder_name, account_number, ifsc_code, bank_name, updated_at FROM fuel_station_bank_details WHERE fuel_station_id = ?",
        [fuelStationId],
        (err, row) => (err ? reject(err) : resolve(row || null))
      );
    });

    if (!bankDetails) {
      return successResponse({ bank_details: null });
    }

    return successResponse({
      bank_details: {
        account_holder_name: bankDetails.account_holder_name,
        account_number: maskValue(decrypt(bankDetails.account_number), 4),
        ifsc_code: maskValue(decrypt(bankDetails.ifsc_code), 4),
        bank_name: bankDetails.bank_name,
        updated_at: bankDetails.updated_at,
      },
    });
  } catch (err) {
    console.error("GET fuel-station bank-details error:", err);
    return errorResponse("Internal server error", 500);
  }
}

/** POST/Update fuel station bank details */
export async function POST(request) {
  const auth = requireAuth(request);
  if (!auth) return errorResponse("Unauthorized", 401);

  const db = getDB();
  await ensureFuelStationBankDetailsTable(db);

  const fuelStationId = await resolveFuelStationId(db, auth);
  if (!fuelStationId) return errorResponse("Unauthorized", 401);

  try {
    const { account_holder_name, account_number, ifsc_code, bank_name } = await request.json();

    if (!account_holder_name || !account_number || !ifsc_code || !bank_name) {
      return errorResponse("All bank details are required", 400);
    }

    const normalizedHolder = String(account_holder_name).trim();
    const normalizedBank = String(bank_name).trim();
    const normalizedAccount = String(account_number).replace(/\s+/g, "");
    const normalizedIfsc = String(ifsc_code).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    if (!/^\d{9,18}$/.test(normalizedAccount)) {
      return errorResponse("Account number must be 9 to 18 digits", 400);
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalizedIfsc)) {
      return errorResponse("Invalid IFSC format. Expected 11 characters (e.g., HDFC0001234)", 400);
    }

    const encryptedAccount = encrypt(normalizedAccount);
    const encryptedIfsc = encrypt(normalizedIfsc);

    const existing = await new Promise((resolve) => {
      db.get("SELECT id FROM fuel_station_bank_details WHERE fuel_station_id = ?", [fuelStationId], (err, row) =>
        resolve(row || null)
      );
    });

    await new Promise((resolve, reject) => {
      if (existing) {
        db.run(
          `UPDATE fuel_station_bank_details
           SET account_holder_name = ?, account_number = ?, ifsc_code = ?, bank_name = ?,
               razorpay_fund_account_id = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE fuel_station_id = ?`,
          [normalizedHolder, encryptedAccount, encryptedIfsc, normalizedBank, fuelStationId],
          (err) => (err ? reject(err) : resolve())
        );
      } else {
        db.run(
          `INSERT INTO fuel_station_bank_details
           (fuel_station_id, account_holder_name, account_number, ifsc_code, bank_name)
           VALUES (?, ?, ?, ?, ?)`,
          [fuelStationId, normalizedHolder, encryptedAccount, encryptedIfsc, normalizedBank],
          (err) => (err ? reject(err) : resolve())
        );
      }
    });

    return successResponse({ message: "Bank details saved successfully." });
  } catch (err) {
    console.error("POST fuel-station bank-details error:", err);
    return errorResponse("Internal server error", 500);
  }
}
