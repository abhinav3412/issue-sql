import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

async function hasColumn(db, tableName, columnName) {
  const columns = await new Promise((resolve) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) return resolve([]);
      resolve(rows || []);
    });
  });
  return columns.some((col) => col.name === columnName);
}

async function resolveStationId(db, rawId) {
  const byId = await new Promise((resolve) => {
    db.get("SELECT id FROM fuel_stations WHERE id = ?", [rawId], (err, row) => resolve(row || null));
  });
  if (byId?.id) return byId.id;

  const hasUserId = await hasColumn(db, "fuel_stations", "user_id");
  if (!hasUserId) return null;

  const byUserId = await new Promise((resolve) => {
    db.get("SELECT id FROM fuel_stations WHERE user_id = ?", [rawId], (err, row) => resolve(row || null));
  });
  return byUserId?.id || null;
}

// Get earnings summary and transaction history
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fuel_station_id = searchParams.get("fuel_station_id");
    const limit = parseInt(searchParams.get("limit")) || 50;
    const offset = parseInt(searchParams.get("offset")) || 0;

    if (!fuel_station_id) {
      return NextResponse.json(
        { success: false, error: "fuel_station_id is required" },
        { status: 400 }
      );
    }

    const db = getDB();
    const hasRunningBalance = await hasColumn(db, "fuel_station_ledger", "running_balance");

    const resolvedStationId = await resolveStationId(db, fuel_station_id);
    if (!resolvedStationId) {
      return NextResponse.json(
        {
          success: true,
          station_earnings: { total_earnings: 0, pending_payout: 0, is_verified: 0, cod_enabled: 0 },
          summary: { total_transactions: 0, completed_earnings: 0, settled_earnings: 0, pending_earnings: 0 },
          transactions: [],
          cod_settlements: [],
          pagination: { limit, offset, total: 0 },
        },
        { status: 200 }
      );
    }

    // Verify fuel station exists and get latest status
    const station = await new Promise((resolve) => {
      db.get(
        "SELECT id, total_earnings, pending_payout, is_verified, cod_enabled FROM fuel_stations WHERE id = ?",
        [resolvedStationId],
        (err, row) => resolve(row || null)
      );
    });

    if (!station) {
      return NextResponse.json(
        {
          success: true,
          station_earnings: { total_earnings: 0, pending_payout: 0, is_verified: 0, cod_enabled: 0 },
          summary: { total_transactions: 0, completed_earnings: 0, settled_earnings: 0, pending_earnings: 0 },
          transactions: [],
          cod_settlements: [],
          pagination: { limit, offset, total: 0 },
        },
        { status: 200 }
      );
    }

    // Get earnings summary by status
    const summary = await new Promise((resolve) => {
      db.get(
        `SELECT
          COUNT(*) as total_transactions,
          SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as completed_earnings,
          SUM(CASE WHEN status = 'settled' THEN amount ELSE 0 END) as settled_earnings,
          SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_earnings
         FROM fuel_station_ledger
         WHERE fuel_station_id = ? AND transaction_type IN ('sale', 'cod_settlement')`,
        [resolvedStationId],
        (err, row) => resolve(row || {})
      );
    });

    // Get transaction history with pagination
    const transactions = await new Promise((resolve) => {
      db.all(
        `SELECT 
          id, transaction_type, amount, description, status,
          ${hasRunningBalance ? "running_balance" : "NULL as running_balance"}, reference_id, created_at, updated_at
         FROM fuel_station_ledger
         WHERE fuel_station_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [resolvedStationId, limit, offset],
        (err, rows) => resolve(rows || [])
      );
    });

    // Get COD settlements
    const cod_settlements = await new Promise((resolve) => {
      db.all(
        `SELECT
          id, service_request_id, worker_id, customer_paid_amount,
          fuel_cost, fuel_station_payout, payment_status,
          collection_method, collected_at, settled_at, created_at
         FROM cod_settlements
         WHERE fuel_station_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [resolvedStationId],
        (err, rows) => resolve(rows || [])
      );
    });

    return NextResponse.json(
      {
        success: true,
        station_earnings: {
          total_earnings: station.total_earnings || 0,
          pending_payout: station.pending_payout || 0,
          is_verified: station.is_verified || 0,
          cod_enabled: station.cod_enabled || 0,
        },
        summary: {
          total_transactions: summary.total_transactions || 0,
          completed_earnings: summary.completed_earnings || 0,
          settled_earnings: summary.settled_earnings || 0,
          pending_earnings: summary.pending_earnings || 0,
        },
        transactions,
        cod_settlements,
        pagination: {
          limit,
          offset,
          total: summary.total_transactions || 0,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Get earnings error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
