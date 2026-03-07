import { NextResponse } from "next/server";
import Razorpay from "razorpay";
const { getDB, getLocalDateTimeString } = require("../../../../../database/db");
const { requireWorker } = require("../../../../../database/auth-middleware");

const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder_secret",
});

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

    const db = getDB();
    await ensureFloatingCashPaymentsTable(db);

    const worker = await new Promise((resolve, reject) => {
      db.get(
        "SELECT id, first_name, last_name, floater_cash FROM workers WHERE id = ?",
        [workerId],
        (err, row) => (err ? reject(err) : resolve(row || null))
      );
    });

    if (!worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const floaterCash = Number(worker.floater_cash || 0);
    if (!Number.isFinite(floaterCash) || floaterCash <= 0) {
      return NextResponse.json({ error: "No floating cash to clear." }, { status: 400 });
    }

    const existingPending = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, amount, amount_paise, razorpay_order_id, created_at
         FROM floating_cash_payments
         WHERE worker_id = ? AND status IN ('created', 'processing')
         ORDER BY id DESC LIMIT 1`,
        [workerId],
        (err, row) => (err ? reject(err) : resolve(row || null))
      );
    });

    if (existingPending?.razorpay_order_id) {
      const createdAt = new Date(String(existingPending.created_at || "").replace(" ", "T"));
      const isRecent =
        Number.isFinite(createdAt.getTime()) && Date.now() - createdAt.getTime() < 15 * 60 * 1000;

      if (isRecent) {
        return NextResponse.json(
          {
            error: "A floating cash payment is already in progress.",
            duplicate: true,
            order_id: existingPending.razorpay_order_id,
            amount: existingPending.amount_paise,
            currency: "INR",
            key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
          },
          { status: 409 }
        );
      }

      await new Promise((resolve) => {
        db.run(
          `UPDATE floating_cash_payments
           SET status = 'failed', failure_reason = ?, updated_at = ?
           WHERE id = ?`,
          ["expired_before_checkout", getLocalDateTimeString(), existingPending.id],
          () => resolve()
        );
      });
    }

    const amountPaise = Math.round(floaterCash * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `floater_clear_${workerId}_${Date.now()}`,
      notes: {
        worker_id: String(workerId),
        purpose: "FLOATING_CASH_CLEAR",
      },
    });

    const now = getLocalDateTimeString();
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO floating_cash_payments
         (worker_id, amount, amount_paise, purpose, razorpay_order_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'FLOATING_CASH_CLEAR', ?, 'created', ?, ?)`,
        [workerId, floaterCash, amountPaise, order.id, now, now],
        (err) => (err ? reject(err) : resolve())
      );
    });

    return NextResponse.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
      floater_cash: floaterCash,
    });
  } catch (err) {
    console.error("Worker floating-cash create-order error:", err);
    return NextResponse.json({ error: "Failed to create floating cash order." }, { status: 500 });
  }
}
