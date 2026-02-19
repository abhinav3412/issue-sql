import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");
const { requireAdmin, errorResponse } = require("../../../../database/auth-middleware");

export async function GET(request) {
    try {
        const auth = requireAdmin(request);
        if (!auth) return errorResponse("Unauthorized", 401);

        const { searchParams } = new URL(request.url);
        const fuel_station_id = searchParams.get("fuel_station_id");
        const status = searchParams.get("status") || "pending";
        const limit = parseInt(searchParams.get("limit")) || 50;
        const offset = parseInt(searchParams.get("offset")) || 0;

        const db = getDB();

        let query = `
      SELECT 
        l.id, l.fuel_station_id, l.transaction_type, l.amount, 
        l.description, l.status, l.created_at,
        COALESCE(fs.station_name, fs.name) AS station_name, fs.email
      FROM fuel_station_ledger l
      JOIN fuel_stations fs ON l.fuel_station_id = fs.id
      WHERE 1=1
    `;
        const params = [];

        if (fuel_station_id) {
            query += ` AND l.fuel_station_id = ?`;
            params.push(fuel_station_id);
        }

        if (status) {
            query += ` AND l.status = ?`;
            params.push(status);
        }

        // Usually we settle 'sale' or 'cod_settlement' (where station is owed money)
        // We might also want to invoke 'payout' records? No, we create payouts.
        // So we are looking for earnings that are pending.
        query += ` AND l.transaction_type IN ('sale', 'cod_settlement')`; // Filter for earnings

        query += ` ORDER BY l.created_at ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const payouts = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        return NextResponse.json(
            { success: true, payouts },
            { status: 200 }
        );
    } catch (err) {
        console.error("Get payouts error:", err);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const auth = requireAdmin(request);
        if (!auth) return errorResponse("Unauthorized", 401);

        const body = await request.json();
        const { fuel_station_id, ledger_ids } = body;

        if (!fuel_station_id || !Array.isArray(ledger_ids) || ledger_ids.length === 0) {
            return NextResponse.json(
                { success: false, error: "fuel_station_id and ledger_ids array required" },
                { status: 400 }
            );
        }

        const db = getDB();
        const updatedAt = getLocalDateTimeString();

        // Calculate total amount to settle for only pending earning entries.
        const settleInput = await new Promise((resolve, reject) => {
            const placeholders = ledger_ids.map(() => "?").join(",");
            db.get(
                `SELECT SUM(amount) as total, COUNT(*) as count FROM fuel_station_ledger 
                 WHERE id IN (${placeholders})
                   AND fuel_station_id = ?
                   AND status = 'pending'
                   AND transaction_type IN ('sale', 'cod_settlement')`,
                [...ledger_ids, fuel_station_id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || { total: 0, count: 0 });
                }
            );
        });
        const amountToSettle = Number(settleInput.total || 0);
        const countToSettle = Number(settleInput.count || 0);

        if (!amountToSettle || amountToSettle <= 0) {
            return NextResponse.json(
                { success: false, error: "No pending valid earnings found for these IDs" },
                { status: 400 }
            );
        }

        // 1. Update ledger entries to 'settled'
        const placeholders = ledger_ids.map(() => "?").join(",");
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE fuel_station_ledger
                 SET status = 'settled', updated_at = ? 
                 WHERE id IN (${placeholders})
                   AND fuel_station_id = ?
                   AND status = 'pending'
                   AND transaction_type IN ('sale', 'cod_settlement')`,
                [updatedAt, ...ledger_ids, fuel_station_id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // 2. Reduce pending payout floor at 0.
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE fuel_stations 
         SET pending_payout = CASE
             WHEN pending_payout - ? < 0 THEN 0
             ELSE pending_payout - ?
           END,
           updated_at = ?
         WHERE id = ?`,
                [amountToSettle, amountToSettle, updatedAt, fuel_station_id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // 3. Create a 'payout' record in ledger
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO fuel_station_ledger 
         (fuel_station_id, transaction_type, amount, description, status, created_at, updated_at)
         VALUES (?, 'payout', ?, ?, 'settled', ?, ?)`,
                [
                    fuel_station_id,
                    -amountToSettle, // Negative because it's money leaving the system to the station
                    `Payout for ${countToSettle} transactions`,
                    updatedAt,
                    updatedAt
                ],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        return NextResponse.json(
            {
                success: true,
                message: "Payout settled successfully",
                settled_amount: amountToSettle,
                count: countToSettle
            },
            { status: 200 }
        );

    } catch (err) {
        console.error("Settle payouts error:", err);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
