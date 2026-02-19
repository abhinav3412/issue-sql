import { NextResponse } from "next/server";
const crypto = require("crypto");
const { getDB, getLocalDateTimeString } = require("../../../../database/db");

/**
 * POST /api/payment/webhook
 * Razorpay webhook endpoint for payment events
 * Signature verification is done to ensure request authenticity
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const signature = request.headers.get("x-razorpay-signature");

    // Get Razorpay webhook secret from environment
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn("RAZORPAY_WEBHOOK_SECRET not configured");
      // In development, allow unverified webhooks. In production, reject.
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "Webhook secret not configured" },
          { status: 500 }
        );
      }
    }

    // Verify signature if secret is configured
    if (webhookSecret && signature) {
      const bodyString = JSON.stringify(body);
      const computedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(bodyString)
        .digest("hex");

      if (computedSignature !== signature) {
        console.error("Webhook signature verification failed");
        return NextResponse.json(
          { error: "Signature verification failed" },
          { status: 401 }
        );
      }
    }

    const db = getDB();
    const event = body.event;
    const paymentData = body.payload?.payment?.entity || {};
    const transferData = body.payload?.transfer?.entity || {};

    const now = getLocalDateTimeString();

    // Ensure payments table exists
    await ensurePaymentsTable(db);

    // Handle payment events
    if (event === "payment.authorized" || event === "payment.captured") {
      const paymentId = paymentData.id;
      const amount = paymentData.amount;
      const status = paymentData.status; // "captured" or "authorized"

      // Find service request by payment ID
      const serviceRequest = await new Promise((resolve) => {
        db.get(
          "SELECT id, user_id FROM service_requests WHERE payment_id = ? OR payment_id = ?",
          [paymentId, `pay_SE${paymentId.slice(-12)}`],
          (err, row) => resolve(row || null)
        );
      });

      if (serviceRequest) {
        // Update or create payment record
        const existingPayment = await new Promise((resolve) => {
          db.get(
            "SELECT id FROM payments WHERE service_request_id = ? AND provider = 'razorpay'",
            [serviceRequest.id],
            (err, row) => resolve(row || null)
          );
        });

        if (existingPayment) {
          // Update existing payment
          await new Promise((resolve) => {
            db.run(
              "UPDATE payments SET status = ?, provider_payment_id = ?, amount = ?, metadata = ?, updated_at = ? WHERE id = ?",
              [
                "captured",
                paymentId,
                amount,
                JSON.stringify(paymentData),
                now,
                existingPayment.id,
              ],
              () => resolve()
            );
          });
        } else {
          // Create new payment record
          await new Promise((resolve) => {
            db.run(
              "INSERT INTO payments (service_request_id, provider, provider_payment_id, amount, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [
                serviceRequest.id,
                "razorpay",
                paymentId,
                amount,
                "captured",
                JSON.stringify(paymentData),
                now,
                now,
              ],
              () => resolve()
            );
          });
        }

        // Update service request payment status
        await new Promise((resolve) => {
          db.run(
            "UPDATE service_requests SET payment_status = 'PAID', payment_details = ? WHERE id = ?",
            [JSON.stringify(paymentData), serviceRequest.id],
            () => resolve()
          );
        });

        console.log(`Payment captured for service request ${serviceRequest.id}`);
      }
    } else if (event === "payment.failed") {
      const paymentId = paymentData.id;

      const serviceRequest = await new Promise((resolve) => {
        db.get(
          "SELECT id FROM service_requests WHERE payment_id = ? OR payment_id = ?",
          [paymentId, `pay_SE${paymentId.slice(-12)}`],
          (err, row) => resolve(row || null)
        );
      });

      if (serviceRequest) {
        // Create failed payment record
        await new Promise((resolve) => {
          db.run(
            "INSERT INTO payments (service_request_id, provider, provider_payment_id, amount, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              serviceRequest.id,
              "razorpay",
              paymentId,
              paymentData.amount || 0,
              "failed",
              JSON.stringify(paymentData),
              now,
              now,
            ],
            () => resolve()
          );
        });

        // Update service request payment status
        await new Promise((resolve) => {
          db.run(
            "UPDATE service_requests SET payment_status = 'FAILED', payment_details = ? WHERE id = ?",
            [JSON.stringify(paymentData), serviceRequest.id],
            () => resolve()
          );
        });

        console.log(`Payment failed for service request ${serviceRequest.id}`);
      }
    } else if (event === "payment.authorized") {
      // Handle authorized but not captured payments
      const paymentId = paymentData.id;
      const amount = paymentData.amount;

      const serviceRequest = await new Promise((resolve) => {
        db.get(
          "SELECT id FROM service_requests WHERE payment_id = ? OR payment_id = ?",
          [paymentId, `pay_SE${paymentId.slice(-12)}`],
          (err, row) => resolve(row || null)
        );
      });

      if (serviceRequest) {
        await new Promise((resolve) => {
          db.run(
            "INSERT INTO payments (service_request_id, provider, provider_payment_id, amount, status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              serviceRequest.id,
              "razorpay",
              paymentId,
              amount,
              "authorized",
              JSON.stringify(paymentData),
              now,
              now,
            ],
            () => resolve()
          );
        });
      }
    }

    return NextResponse.json({ success: true, event });
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Return 200 to acknowledge receipt even if there was an error
    // This prevents Razorpay from retrying
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 200 }
    );
  }
}

/**
 * Ensure payments table exists
 */
function ensurePaymentsTable(db) {
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_request_id INTEGER NOT NULL,
        provider VARCHAR(50) NOT NULL,
        provider_payment_id VARCHAR(128),
        amount INTEGER NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(30) DEFAULT 'created',
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_request_id) REFERENCES service_requests(id)
      )`,
      (err) => {
        if (err) console.error("Error creating payments table:", err);
        resolve();
      }
    );
  });
}
