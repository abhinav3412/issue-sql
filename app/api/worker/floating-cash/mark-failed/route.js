import { NextResponse } from "next/server";
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

export async function POST(request) {
  try {
    const auth = requireWorker(request);
    if (!auth?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workerId = Number(auth.id);

    const { razorpay_order_id, reason } = (await request.json()) || {};
    if (!razorpay_order_id) {
      return NextResponse.json({ error: "razorpay_order_id is required." }, { status: 400 });
    }

    const db = getDB();
    await ensureFloatingCashPaymentsTable(db);
    const now = getLocalDateTimeString();

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE floating_cash_payments
         SET status = 'failed', failure_reason = ?, updated_at = ?
         WHERE razorpay_order_id = ? AND worker_id = ? AND status IN ('created', 'processing')`,
        [reason || "payment_failed_or_cancelled", now, razorpay_order_id, workerId],
        (err) => (err ? reject(err) : resolve())
      );
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Worker floating-cash mark-failed error:", err);
    return NextResponse.json({ error: "Failed to update payment status." }, { status: 500 });
  }
}
