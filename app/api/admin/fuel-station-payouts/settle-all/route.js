import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../../database/db");
const { requireAdmin, errorResponse, successResponse } = require("../../../../../database/auth-middleware");
const { createRazorpayContact, createRazorpayFundAccount, createRazorpayPayout } = require("../../../../utils/razorpayX");
const { decrypt } = require("../../../../utils/encryption");

function normalizeAccountNumber(value) {
  return String(value || "").replace(/\s+/g, "");
}

function normalizeIfsc(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function isValidIfsc(value) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value);
}

function sanitizeRazorpayName(value) {
  const ascii = String(value || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "");
  const cleaned = ascii
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 50);
}

function buildRazorpayContactName(station) {
  const candidates = [
    sanitizeRazorpayName(station.station_name),
    sanitizeRazorpayName(station.account_holder_name),
    "Fuel Station Account",
  ];
  for (const name of candidates) {
    if (name.length >= 3) {
      return name;
    }
  }
  return "Fuel Station Account";
}

function normalizeContactEmail(value, stationId) {
  const email = String(value || "").trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  return `station${stationId}@example.com`;
}

function normalizeContactNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return digits;
  if (/^91\d{10}$/.test(digits)) return digits;
  return "";
}

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

async function settleStation(db, station) {
  const fuelStationId = station.id;
  const stationName = station.station_name || `Fuel Station ${fuelStationId}`;
  const now = getLocalDateTimeString();

  const pending = await new Promise((resolve, reject) => {
    db.all(
      `SELECT id, amount
       FROM fuel_station_ledger
       WHERE fuel_station_id = ?
         AND status = 'pending'
         AND transaction_type IN ('sale', 'cod_settlement')
       ORDER BY created_at ASC`,
      [fuelStationId],
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    );
  });

  if (!pending.length) {
    return {
      fuel_station_id: fuelStationId,
      station_name: stationName,
      status: "skipped",
      settled_amount: 0,
      count: 0,
      reason: "No pending earning entries",
    };
  }

  const ledgerIds = pending.map((row) => row.id);
  const amountToSettle = pending.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const placeholders = ledgerIds.map(() => "?").join(",");
  const accountNumber = normalizeAccountNumber(decrypt(station.account_number || ""));
  const ifsc = normalizeIfsc(decrypt(station.ifsc_code || ""));

  if (!station.account_number || !station.ifsc_code) {
    throw new Error("Bank details missing. Please add account number and IFSC from station login.");
  }
  if (!/^\d{9,18}$/.test(accountNumber)) {
    throw new Error("Invalid station account number. Please update bank details.");
  }
  if (!isValidIfsc(ifsc)) {
    throw new Error("Invalid station IFSC. Please update bank details.");
  }

  let contactId = station.razorpay_contact_id;
  let fundAccountId = station.razorpay_fund_account_id;

  if (!contactId) {
    const contactName = buildRazorpayContactName(station);
    const contactNumber = normalizeContactNumber(station.phone_number);
    const contactEmail = normalizeContactEmail(station.email, fuelStationId);

    if (!contactNumber) {
      throw new Error(`Invalid station phone for payout contact (station ${fuelStationId}). Update station phone to a valid 10-digit number.`);
    }

    const contact = await createRazorpayContact({
      name: contactName,
      email: contactEmail,
      contact: contactNumber,
    });
    contactId = contact.id;
    await new Promise((resolve) => {
      db.run(
        "UPDATE fuel_station_bank_details SET razorpay_contact_id = ?, updated_at = CURRENT_TIMESTAMP WHERE fuel_station_id = ?",
        [contactId, fuelStationId],
        () => resolve()
      );
    });
  }

  if (!fundAccountId) {
    const fundAccountName = "Fuel Station Beneficiary";

    const fundAccount = await createRazorpayFundAccount(contactId, {
      name: fundAccountName,
      ifsc,
      account_number: accountNumber,
    });
    fundAccountId = fundAccount.id;
    await new Promise((resolve) => {
      db.run(
        "UPDATE fuel_station_bank_details SET razorpay_fund_account_id = ?, updated_at = CURRENT_TIMESTAMP WHERE fuel_station_id = ?",
        [fundAccountId, fuelStationId],
        () => resolve()
      );
    });
  }

  const payout = await createRazorpayPayout({
    fund_account_id: fundAccountId,
    amount: amountToSettle,
    reference_id: `STATION_SETTLE_${fuelStationId}_${Date.now()}`,
  });

  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE fuel_station_ledger
       SET status = 'settled', updated_at = ?
       WHERE id IN (${placeholders})
         AND fuel_station_id = ?
         AND status = 'pending'
         AND transaction_type IN ('sale', 'cod_settlement')`,
      [now, ...ledgerIds, fuelStationId],
      (err) => (err ? reject(err) : resolve())
    );
  });

  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE fuel_stations
       SET pending_payout = CASE
         WHEN pending_payout - ? < 0 THEN 0
         ELSE pending_payout - ?
       END,
       updated_at = ?
       WHERE id = ?`,
      [amountToSettle, amountToSettle, now, fuelStationId],
      (err) => (err ? reject(err) : resolve())
    );
  });

  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO fuel_station_ledger
       (fuel_station_id, transaction_type, amount, description, status, reference_id, created_at, updated_at)
       VALUES (?, 'payout', ?, ?, 'settled', ?, ?, ?)`,
      [
        fuelStationId,
        -amountToSettle,
        `Payout for ${ledgerIds.length} transactions`,
        payout.id,
        now,
        now,
      ],
      (err) => (err ? reject(err) : resolve())
    );
  });

  return {
    fuel_station_id: fuelStationId,
    station_name: stationName,
    status: "success",
    settled_amount: amountToSettle,
    count: ledgerIds.length,
    payout_id: payout.id,
  };
}

export async function POST(request) {
  const auth = requireAdmin(request);
  if (!auth) return errorResponse("Unauthorized", 401);

  const db = getDB();

  try {
    await ensureFuelStationBankDetailsTable(db);

    const body = await request.json().catch(() => ({}));
    const requestedStationId = body?.fuel_station_id ? Number(body.fuel_station_id) : null;

    let query = `
      SELECT fs.id, COALESCE(fs.station_name, fs.name) AS station_name,
             fs.email, fs.phone_number,
             bd.account_holder_name, bd.account_number, bd.ifsc_code, bd.bank_name,
             bd.razorpay_contact_id, bd.razorpay_fund_account_id
      FROM fuel_stations fs
      LEFT JOIN fuel_station_bank_details bd ON bd.fuel_station_id = fs.id
      WHERE EXISTS (
        SELECT 1
        FROM fuel_station_ledger l
        WHERE l.fuel_station_id = fs.id
          AND l.status = 'pending'
          AND l.transaction_type IN ('sale', 'cod_settlement')
      )
      ORDER BY fs.id ASC
    `;
    const params = [];
    if (requestedStationId) {
      query = `
        SELECT fs.id, COALESCE(fs.station_name, fs.name) AS station_name,
               fs.email, fs.phone_number,
               bd.account_holder_name, bd.account_number, bd.ifsc_code, bd.bank_name,
               bd.razorpay_contact_id, bd.razorpay_fund_account_id
        FROM fuel_stations fs
        LEFT JOIN fuel_station_bank_details bd ON bd.fuel_station_id = fs.id
        WHERE fs.id = ?
          AND EXISTS (
            SELECT 1
            FROM fuel_station_ledger l
            WHERE l.fuel_station_id = fs.id
              AND l.status = 'pending'
              AND l.transaction_type IN ('sale', 'cod_settlement')
          )
      `;
      params.push(requestedStationId);
    }

    const eligibleStations = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });

    if (!eligibleStations.length) {
      return errorResponse("No stations with pending payouts found.", 400);
    }

    const results = {
      total_stations: eligibleStations.length,
      success_count: 0,
      failed_count: 0,
      total_amount: 0,
      details: [],
    };

    for (const station of eligibleStations) {
      try {
        const settled = await settleStation(db, station);
        if (settled.status === "success") {
          results.success_count += 1;
          results.total_amount += Number(settled.settled_amount || 0);
        } else {
          results.failed_count += 1;
        }
        results.details.push(settled);
      } catch (err) {
        results.failed_count += 1;
        results.details.push({
          fuel_station_id: station.id,
          station_name: station.station_name,
          status: "failed",
          error: err?.message || "Settlement failed",
        });
      }
    }

    return successResponse(results);
  } catch (err) {
    console.error("Bulk station payout error:", err);
    return errorResponse("Internal server error during station payout processing", 500);
  }
}
