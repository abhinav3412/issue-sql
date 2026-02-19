import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../../database/db");

export async function POST(request) {
    try {
        const { worker_id, notes } = await request.json();

        if (!worker_id) {
            return NextResponse.json({ error: "Worker ID is required" }, { status: 400 });
        }

        const db = getDB();
        const now = getLocalDateTimeString();

        // Get current floater_cash before clearing
        const worker = await new Promise((resolve) => {
            db.get(
                "SELECT floater_cash FROM workers WHERE id = ?",
                [worker_id],
                (err, row) => {
                    resolve(row || { floater_cash: 0 });
                }
            );
        });

        const floaterCashAmount = worker.floater_cash || 0;

        // Ensure settlements table exists
        await ensureSettlementsTable(db);

        // Create a collection settlement record if there's cash to collect
        if (floaterCashAmount > 0) {
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
                        worker_id,
                        now,
                        floaterCashAmount,
                        0,
                        0,
                        0,
                        0,
                        0,
                        0,
                        floaterCashAmount,
                        'collected',
                        `Cash collection: ${floaterCashAmount} INR collected. ${notes || ''}`,
                        now,
                        now
                    ],
                    (err) => {
                        if (err) {
                            console.error("Settlement record creation failed:", err);
                        }
                    }
                );
                resolve();
            });
        }

        // Clear floater cash and unlock (admin action)
        await new Promise((resolve, reject) => {
            db.run(
                "UPDATE workers SET floater_cash = 0, last_cash_collection_at = ?, status_locked = 0, lock_reason = NULL WHERE id = ?",
                [now, worker_id],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Log the activity
        await new Promise((resolve) => {
            db.run(
                "INSERT INTO activity_log (type, message, entity_type, entity_id, created_at) VALUES (?, ?, 'worker', ?, ?)",
                ["cash_collected", `Admin collected ${floaterCashAmount} floater cash from worker ID ${worker_id}`, worker_id, now],
                () => resolve()
            );
        });

        return NextResponse.json({
            success: true,
            message: "Cash collection recorded and worker status unlocked.",
            amount_collected: floaterCashAmount,
            worker_id: worker_id,
            collected_at: now
        });
    } catch (err) {
        console.error("Cash collection error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * Ensure settlements table exists
 */
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
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (service_request_id) REFERENCES service_requests(id),
                FOREIGN KEY (worker_id) REFERENCES workers(id),
                FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id)
            )`,
            (err) => {
                if (err && !/already exists/i.test(err.message)) {
                    console.error("Create settlements table failed:", err);
                }
                resolve();
            }
        );
    });
}
