import { NextResponse } from "next/server";
const { getDB } = require("../../../../../database/db");
const bcrypt = require("bcryptjs");

const isDuplicateColumnError = (err) =>
    /duplicate column name|already exists|42701|ER_DUP_FIELDNAME/i.test(String(err?.message || ""));

async function ensureFuelStationAdminColumns(db) {
    const columns = [
        "is_verified INTEGER DEFAULT 0",
        "is_open INTEGER DEFAULT 1",
        "cod_enabled INTEGER DEFAULT 1",
        "cod_balance_limit INTEGER DEFAULT 50000",
        "platform_trust_flag INTEGER DEFAULT 0",
    ];

    for (const column of columns) {
        await new Promise((resolve) => {
            db.run(`ALTER TABLE fuel_stations ADD COLUMN ${column}`, (err) => {
                if (err && !isDuplicateColumnError(err)) {
                    console.error(`Add fuel_stations.${column} failed:`, err);
                }
                resolve();
            });
        });
    }
}

async function getTableColumns(db, tableName) {
    const rows = await new Promise((resolve) => {
        db.all(`PRAGMA table_info(${tableName})`, [], (err, r) => {
            if (err) return resolve([]);
            resolve(r || []);
        });
    });
    return new Set(rows.map((r) => String(r.name || "").toLowerCase()));
}

async function resolveStationRow(db, rawId) {
    const byId = await new Promise((resolve, reject) => {
        db.get("SELECT id, user_id FROM fuel_stations WHERE id = ?", [rawId], (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
    if (byId) return byId;

    const cols = await getTableColumns(db, "fuel_stations");
    if (!cols.has("user_id")) return null;

    return new Promise((resolve, reject) => {
        db.get("SELECT id, user_id FROM fuel_stations WHERE user_id = ?", [rawId], (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

export async function GET(request, props) {
    const params = await props.params;
    const { id } = params;

    if (!id) {
        return NextResponse.json(
            { success: false, error: "Station ID is required" },
            { status: 400 }
        );
    }

    const db = getDB();

    try {
        await ensureFuelStationAdminColumns(db);
        const resolved = await resolveStationRow(db, id);
        if (!resolved) {
            return NextResponse.json(
                { success: false, error: "Fuel station not found" },
                { status: 404 }
            );
        }
        const stationId = resolved.id;
        const linkedUserId = resolved.user_id ? Number(resolved.user_id) : null;
        const resolved = await resolveStationRow(db, id);
        if (!resolved) {
            return NextResponse.json(
                { success: false, error: "Fuel station not found" },
                { status: 404 }
            );
        }
        const stationId = resolved.id;

        // 1. Get Station Details
        const station = await new Promise((resolve, reject) => {
            db.get(
                `SELECT fs.*, 
                u.email as linked_user_email
         FROM fuel_stations fs
         LEFT JOIN users u ON fs.user_id = u.id
         WHERE fs.id = ?`,
                [stationId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!station) {
            return NextResponse.json(
                { success: false, error: "Fuel station not found" },
                { status: 404 }
            );
        }

        // 2. Get Stock Levels
        const stocks = await new Promise((resolve, reject) => {
            db.all(
                `SELECT fuel_type, stock_litres FROM fuel_station_stock WHERE fuel_station_id = ?`,
                [stationId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Format stocks object: { petrol: 100, diesel: 200 }
        const stocksObj = {};
        stocks.forEach((s) => {
            stocksObj[s.fuel_type] = s.stock_litres;
        });

        // 3. Get Recent Ledger (last 10)
        const recent_ledger = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM fuel_station_ledger 
         WHERE fuel_station_id = ? 
         ORDER BY created_at DESC LIMIT 10`,
                [stationId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        return NextResponse.json(
            {
                success: true,
                station: {
                    ...station,
                    stocks: stocksObj,
                },
                recent_ledger,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Get station details error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function PATCH(request, props) {
    const params = await props.params;
    const { id } = params;
    const body = await request.json();

    if (!id) {
        return NextResponse.json(
            { success: false, error: "Station ID is required" },
            { status: 400 }
        );
    }

    const { new_password, ...otherUpdates } = body;

    const allowedFields = [
        "is_verified",
        "is_open",
        "cod_enabled",
        "cod_balance_limit",
        "platform_trust_flag",
    ];
    const updates = [];
    const values = [];

    // Filter body for allowed fields
    for (const key of Object.keys(otherUpdates)) {
        if (allowedFields.includes(key)) {
            updates.push(`${key} = ?`);
            // Convert booleans to 1/0
            const val = otherUpdates[key];
            values.push(typeof val === "boolean" ? (val ? 1 : 0) : val);
        }
    }

    const db = getDB();

    try {
        await ensureFuelStationAdminColumns(db);

        const stationCols = await getTableColumns(db, "fuel_stations");
        // 1. Update station fields if any
        const filteredUpdates = [];
        const filteredValues = [];
        for (let i = 0; i < updates.length; i += 1) {
            const col = updates[i].split("=")[0].trim().toLowerCase();
            if (stationCols.has(col)) {
                filteredUpdates.push(updates[i]);
                filteredValues.push(values[i]);
            }
        }

        const canUpdateUpdatedAt = stationCols.has("updated_at");
        if (filteredUpdates.length > 0) {
            filteredValues.push(stationId);
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE fuel_stations SET ${filteredUpdates.join(", ")}${canUpdateUpdatedAt ? ", updated_at = CURRENT_TIMESTAMP" : ""} WHERE id = ?`,
                    filteredValues,
                    function (err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    }
                );
            });
        }

        // 2. Handle password reset if provided
        if (new_password) {
            // Find linked user_id
            const station = await new Promise((resolve, reject) => {
                db.get(`SELECT user_id FROM fuel_stations WHERE id = ?`, [stationId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (station && station.user_id) {
                const hashedPassword = await bcrypt.hash(new_password, 10);
                await new Promise((resolve, reject) => {
                    db.run(
                        `UPDATE users SET password = ? WHERE id = ?`,
                        [hashedPassword, station.user_id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        }

        return NextResponse.json(
            { success: true, message: "Station updated successfully" },
            { status: 200 }
        );
    } catch (error) {
        console.error("Update station error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function DELETE(request, props) {
    const params = await props.params;
    const { id } = params;

    if (!id) {
        return NextResponse.json(
            { success: false, error: "Station ID is required" },
            { status: 400 }
        );
    }

    const db = getDB();

    try {
        const station = await resolveStationRow(db, id);
        if (!station) {
            return NextResponse.json(
                { success: false, error: "Fuel station not found" },
                { status: 404 }
            );
        }
        const stationId = station.id;
        const linkedUserId = station.user_id ? Number(station.user_id) : null;

        // Disable linked user credentials first so deleted station accounts cannot log in.
        if (linkedUserId) {
            const randomPassword = `deleted_${linkedUserId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const hashedPassword = await bcrypt.hash(randomPassword, 10);
            const tombstoneEmail = `deleted_station_${linkedUserId}_${Date.now()}@deleted.local`;
            await new Promise((resolve, reject) => {
                db.run(
                    "UPDATE users SET password = ?, email = ? WHERE id = ?",
                    [hashedPassword, tombstoneEmail, linkedUserId],
                    function (err) {
                        if (err) return reject(err);
                        resolve(this.changes);
                    }
                );
            });

            if (linkedUserId && stationCols.has("user_id")) {
                const syncValues = [...filteredValues.slice(0, filteredUpdates.length), linkedUserId, stationId];
                await new Promise((resolve) => {
                    db.run(
                        `UPDATE fuel_stations
                         SET ${filteredUpdates.join(", ")}${canUpdateUpdatedAt ? ", updated_at = CURRENT_TIMESTAMP" : ""}
                         WHERE user_id = ? AND id != ?`,
                        syncValues,
                        () => resolve()
                    );
                });
            }
        }

        // Delete dependent rows first to satisfy FK constraints in Postgres.
        const dependentDeletes = [
            "DELETE FROM fuel_station_bank_details WHERE fuel_station_id = ?",
            "DELETE FROM fuel_station_stock WHERE fuel_station_id = ?",
            "DELETE FROM fuel_station_ledger WHERE fuel_station_id = ?",
            "DELETE FROM cod_settlements WHERE fuel_station_id = ?",
            "DELETE FROM settlements WHERE fuel_station_id = ?",
            "DELETE FROM fuel_station_assignments WHERE fuel_station_id = ?",
            "DELETE FROM worker_station_cache WHERE fuel_station_id = ?",
        ];

        for (const sql of dependentDeletes) {
            await new Promise((resolve) => {
                db.run(sql, [stationId], () => resolve());
            });
        }

        const deleted = await new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM fuel_stations WHERE id = ?`,
                [stationId],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });

        if (Number(deleted || 0) === 0) {
            return NextResponse.json(
                { success: false, error: "Fuel station was not deleted" },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { success: true, message: "Station deleted successfully" },
            { status: 200 }
        );
    } catch (error) {
        console.error("Delete station error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
