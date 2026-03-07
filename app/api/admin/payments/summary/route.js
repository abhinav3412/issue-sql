import { NextResponse } from "next/server";
const { getDB } = require("../../../../../database/db");

/**
 * GET /api/admin/payments/summary
 * Get payment summary statistics
 * Query params: days (default: 30)
 */
export async function GET(request) {
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
          COUNT(DISTINCT service_request_id) as unique_orders,
          SUM(amount) as total_amount,
          ROUND(AVG(amount), 2) as avg_payment_amount,
          SUM(CASE WHEN provider = 'razorpay' THEN 1 ELSE 0 END) as online_payments,
          SUM(CASE WHEN provider = 'cod' THEN 1 ELSE 0 END) as cod_payments,
          SUM(CASE WHEN status = 'captured' THEN amount ELSE 0 END) as captured_amount,
          SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END) as failed_amount,
          SUM(CASE WHEN status = 'pending_collection' THEN amount ELSE 0 END) as pending_collection_amount
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
          ROUND(AVG(amount), 2) as avg_amount,
          SUM(CASE WHEN status = 'captured' THEN 1 ELSE 0 END) as captured_count,
          SUM(CASE WHEN status = 'captured' THEN amount ELSE 0 END) as captured_amount,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          ROUND(SUM(CASE WHEN status = 'captured' THEN 1 ELSE 0 END) / COUNT(*) * 100, 2) as success_rate_percentage
        FROM payments
        WHERE created_at >= ?
        GROUP BY provider
        ORDER BY count DESC`,
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
          SUM(amount) as total_amount,
          ROUND(AVG(amount), 2) as avg_amount
        FROM payments
        WHERE created_at >= ?
        GROUP BY status
        ORDER BY count DESC`,
        [dateStr],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });

    // Daily trend
    const dailyTrend = await new Promise((resolve) => {
      db.all(
        `SELECT
          DATE(created_at) as date,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          COUNT(DISTINCT provider) as providers_used
        FROM payments
        WHERE created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY date DESC`,
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
      daily_trend: dailyTrend,
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
