import { NextResponse } from "next/server";
import crypto from "crypto";
const { getDB, getLocalDateTimeString } = require("../../../../../database/db");
const { requireWorker } = require("../../../../../database/auth-middleware");

function ensureFloatingCashPaymentsTable(db) {
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS floating_cash_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        amount_paise INTEGER NOT NULL,
        purpose VARCHAR(50) NOT NULL DEFAULT 'FLOATING_CASH_CLEAR',
        razorpay_order_id VARCHAR(128) UNIQUE,
        razorpay_payment_id VARCHAR(128),
        razorpay_signature TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'created',
        failure_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (worker_id) REFERENCES workers(id)
      )`,
      () => resolve()
    );
  });
}

function ensureSettlementsTable(db) {
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_request_id INTEGER,
        worker_id INTEGER,
        fuel_station_id INTEGER,
        settlement_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        customer_amount INTEGER NOT NULL,
        fuel_cost INTEGER NOT NULL,
        delivery_fee INTEGER NOT NULL,
        platform_service_fee INTEGER NOT NULL,
        surge_fee INTEGER DEFAULT 0,
        fuel_station_payout INTEGER NOT NULL,
        worker_payout REAL NOT NULL,
        platform_profit INTEGER NOT NULL,
        worker_base_pay REAL DEFAULT 0,
        worker_distance_km REAL DEFAULT 0,
        worker_distance_pay REAL DEFAULT 0,
        worker_surge_bonus REAL DEFAULT 0,
        worker_waiting_time_bonus REAL DEFAULT 0,
        worker_incentive_bonus REAL DEFAULT 0,
        worker_penalty REAL DEFAULT 0,
        worker_minimum_guarantee REAL DEFAULT 0,
        status VARCHAR(30) DEFAULT 'calculated',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      () => resolve()
    );
  });
}

function ensureActivityLogTable(db) {
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type VARCHAR(50) NOT NULL,
        message TEXT,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      () => resolve()
    );
  });
}

export async function POST(request) {
  try {
    const auth = requireWorker(request);
    if (!auth?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workerId = Number(auth.id);
    if (!Number.isFinite(workerId) || workerId <= 0) {
      return NextResponse.json({ error: "Invalid worker identity" }, { status: 401 });
    }

    const body = await request.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment verification fields." }, { status: 400 });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET || "placeholder_secret";
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ success: false, error: "Invalid payment signature." }, { status: 400 });
    }

    const db = getDB();
    await new Promise((resolve) => {
      db.run("ALTER TABLE workers ADD COLUMN auto_lock_exempt INTEGER DEFAULT 0", () => resolve());
    });
    await ensureFloatingCashPaymentsTable(db);
    await ensureSettlementsTable(db);
    await ensureActivityLogTable(db);

    const paymentRow = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, worker_id, amount, amount_paise, status, razorpay_payment_id
         FROM floating_cash_payments
         WHERE razorpay_order_id = ?`,
        [razorpay_order_id],
        (err, row) => (err ? reject(err) : resolve(row || null))
      );
    });

    if (!paymentRow) {
      return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
    }

    if (Number(paymentRow.worker_id) !== workerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (paymentRow.status === "paid") {
      return NextResponse.json({
        success: true,
        already_processed: true,
        message: "Floating cash was already settled.",
      });
    }

    const now = getLocalDateTimeString();
    const amount = Number(paymentRow.amount || 0);

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE floating_cash_payments
         SET razorpay_payment_id = ?, razorpay_signature = ?, status = 'paid', updated_at = ?
         WHERE id = ?`,
        [razorpay_payment_id, razorpay_signature, now, paymentRow.id],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const worker = await new Promise((resolve, reject) => {
      db.get("SELECT floater_cash FROM workers WHERE id = ?", [workerId], (err, row) =>
        err ? reject(err) : resolve(row || { floater_cash: 0 })
      );
    });
    const previousFloater = Number(worker?.floater_cash || 0);

    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE workers SET floater_cash = 0, last_cash_collection_at = ?, status_locked = 0, auto_lock_exempt = 0, lock_reason = NULL WHERE id = ?",
        [now, workerId],
        (err) => (err ? reject(err) : resolve())
      );
    });

    await new Promise((resolve) => {
      db.run(
        `INSERT INTO settlements (
          service_request_id, worker_id, settlement_date,
          customer_amount, fuel_cost, delivery_fee, platform_service_fee, surge_fee,
          fuel_station_payout, worker_payout, platform_profit,
          status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          null,
          workerId,
          now,
          amount,
          0,
          0,
          0,
          0,
          0,
          0,
          amount,
          "collected",
          `purpose=FLOATING_CASH_CLEAR; order_id=${razorpay_order_id}; payment_id=${razorpay_payment_id}; previous_floater=${previousFloater}`,
          now,
          now,
        ],
        () => resolve()
      );
    });

    await new Promise((resolve) => {
      db.run(
        "INSERT INTO activity_log (type, message, entity_type, entity_id, created_at) VALUES (?, ?, 'worker', ?, ?)",
        [
          "floating_cash_cleared",
          `Worker ${workerId} cleared floating cash via Razorpay. purpose=FLOATING_CASH_CLEAR amount=${amount}`,
          workerId,
          now,
        ],
        () => resolve()
      );
    });

    return NextResponse.json({
      success: true,
      message: "Floating cash paid successfully.",
      purpose: "FLOATING_CASH_CLEAR",
      amount,
    });
  } catch (err) {
    console.error("Worker floating-cash verify error:", err);
    return NextResponse.json({ error: "Failed to verify floating cash payment." }, { status: 500 });
  }
}
