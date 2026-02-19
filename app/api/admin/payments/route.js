import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");

/**
 * GET /api/admin/payments
 * List all payments with optional filters
 * Query params: provider, status, user_id, service_request_id, start_date, end_date, limit, offset
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider");
    const status = url.searchParams.get("status");
    const userId = url.searchParams.get("user_id");
    const serviceRequestId = url.searchParams.get("service_request_id");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const offset = Number(url.searchParams.get("offset")) || 0;

    const db = getDB();
    await ensurePaymentsTable(db);

    let sql = `
      SELECT 
        p.*,
        sr.user_id,
        sr.service_type,
        sr.amount as service_request_amount,
        sr.payment_method as service_request_payment_method,
        sr.payment_status as service_request_payment_status,
        u.first_name,
        u.last_name,
        u.email
      FROM payments p
      LEFT JOIN service_requests sr ON p.service_request_id = sr.id
      LEFT JOIN users u ON sr.user_id = u.id
    `;

    const params = [];
    const conditions = [];

    if (provider) {
      conditions.push("p.provider = ?");
      params.push(provider);
    }

    if (status) {
      conditions.push("p.status = ?");
      params.push(status);
    }

    if (userId) {
      conditions.push("sr.user_id = ?");
      params.push(Number(userId));
    }

    if (serviceRequestId) {
      conditions.push("p.service_request_id = ?");
      params.push(Number(serviceRequestId));
    }

    if (startDate) {
      conditions.push("p.created_at >= ?");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("p.created_at <= ?");
      params.push(endDate);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const payments = await new Promise((resolve) => {
      db.all(sql, params, (err, rows) => {
        resolve(rows || []);
      });
    });

    // Get total count
    let countSql = "SELECT COUNT(*) as count FROM payments p LEFT JOIN service_requests sr ON p.service_request_id = sr.id";
    const countParams = [];
    const countConditions = [];

    if (provider) {
      countConditions.push("p.provider = ?");
      countParams.push(provider);
    }
    if (status) {
      countConditions.push("p.status = ?");
      countParams.push(status);
    }
    if (userId) {
      countConditions.push("sr.user_id = ?");
      countParams.push(Number(userId));
    }
    if (serviceRequestId) {
      countConditions.push("p.service_request_id = ?");
      countParams.push(Number(serviceRequestId));
    }
    if (startDate) {
      countConditions.push("p.created_at >= ?");
      countParams.push(startDate);
    }
    if (endDate) {
      countConditions.push("p.created_at <= ?");
      countParams.push(endDate);
    }

    if (countConditions.length > 0) {
      countSql += " WHERE " + countConditions.join(" AND ");
    }

    const countResult = await new Promise((resolve) => {
      db.get(countSql, countParams, (err, row) => {
        resolve(row || { count: 0 });
      });
    });

    return NextResponse.json({
      success: true,
      payments,
      pagination: {
        limit,
        offset,
        total: countResult.count,
        has_more: offset + limit < countResult.count,
      },
    });
  } catch (err) {
    console.error("Get payments error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve payments" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/payments/reconcile
 * Mark a payment as reconciled
 * Body: { payment_id, status, notes }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { payment_id, status, notes } = body;

    if (!payment_id) {
      return NextResponse.json(
        { error: "payment_id is required" },
        { status: 400 }
      );
    }

    if (!status || !["captured", "failed", "refunded", "reconciled"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be one of: captured, failed, refunded, reconciled" },
        { status: 400 }
      );
    }

    const db = getDB();
    await ensurePaymentsTable(db);

    const now = getLocalDateTimeString();

    // Update payment status
    await new Promise((resolve) => {
      db.run(
        "UPDATE payments SET status = ?, updated_at = ? WHERE id = ?",
        [status, now, payment_id],
        (err) => {
          if (err) console.error("Update payment error:", err);
          resolve();
        }
      );
    });

    return NextResponse.json({
      success: true,
      message: `Payment marked as ${status}`,
    });
  } catch (err) {
    console.error("Reconcile payment error:", err);
    return NextResponse.json(
      { error: "Failed to reconcile payment" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/payments/summary
 * Get payment summary statistics
 */
export async function getSummary(request) {
  try {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days")) || 30;

    const db = getDB();
    await ensurePaymentsTable(db);

    // Get date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const dateStr = startDate.toISOString().split("T")[0];

    // Overall summary
    const summary = await new Promise((resolve) => {
      db.get(
        `SELECT
          COUNT(*) as total_payments,
          SUM(CASE WHEN provider = 'razorpay' THEN 1 ELSE 0 END) as online_payments,
          SUM(CASE WHEN provider = 'cod' THEN 1 ELSE 0 END) as cod_payments,
          SUM(CASE WHEN status = 'captured' THEN amount ELSE 0 END) as captured_amount,
          SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END) as failed_amount,
          SUM(CASE WHEN status = 'pending_collection' THEN amount ELSE 0 END) as pending_collection_amount,
          COUNT(DISTINCT service_request_id) as unique_orders
        FROM payments
        WHERE created_at >= ?`,
        [dateStr],
        (err, row) => {
          resolve(row || {});
        }
      );
    });

    // Provider breakdown
    const providerBreakdown = await new Promise((resolve) => {
      db.all(
        `SELECT
          provider,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          SUM(CASE WHEN status = 'captured' THEN 1 ELSE 0 END) as captured_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          ROUND(SUM(CASE WHEN status = 'captured' THEN 1 ELSE 0 END) / COUNT(*) * 100, 2) as success_rate_percentage
        FROM payments
        WHERE created_at >= ?
        GROUP BY provider`,
        [dateStr],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });

    // Status breakdown
    const statusBreakdown = await new Promise((resolve) => {
      db.all(
        `SELECT
          status,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM payments
        WHERE created_at >= ?
        GROUP BY status`,
        [dateStr],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });

    return NextResponse.json({
      success: true,
      period: {
        days,
        start_date: dateStr,
        end_date: new Date().toISOString().split("T")[0],
      },
      summary,
      provider_breakdown: providerBreakdown,
      status_breakdown: statusBreakdown,
    });
  } catch (err) {
    console.error("Get summary error:", err);
    return NextResponse.json(
      { error: "Failed to get summary", details: err.message },
      { status: 500 }
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
        if (err && !/already exists/i.test(err.message)) {
          console.error("Create payments table failed:", err);
        }
        resolve();
      }
    );
  });
}
