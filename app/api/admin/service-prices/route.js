import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

async function ensureServicePricesTable(db) {
    await new Promise((resolve, reject) => {
        db.run(
            `CREATE TABLE IF NOT EXISTS service_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                service_type VARCHAR(50) UNIQUE NOT NULL,
                amount INTEGER NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            (err) => (err ? reject(err) : resolve())
        );
    });

    const defaults = [
        ["petrol", 100],
        ["diesel", 100],
        ["crane", 1500],
        ["mechanic_bike", 500],
        ["mechanic_car", 1200],
    ];
    for (const [serviceType, amount] of defaults) {
        await new Promise((resolve) => {
            db.run(
                "INSERT OR IGNORE INTO service_prices (service_type, amount, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                [serviceType, amount],
                () => resolve()
            );
        });
    }
}

export async function GET() {
    try {
        const db = getDB();
        await ensureServicePricesTable(db);
        const prices = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM service_prices", (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        return NextResponse.json(prices);
    } catch (err) {
        console.error("Service prices fetch error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { prices } = body; // Expected: [{ service_type: 'crane', amount: 1500 }, ...]

        if (!Array.isArray(prices)) {
            return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
        }

        const db = getDB();
        await ensureServicePricesTable(db);
        for (const item of prices) {
            const updated = await new Promise((resolve, reject) => {
                db.run(
                    "UPDATE service_prices SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE service_type = ?",
                    [item.amount, item.service_type],
                    function (err) {
                        if (err) return reject(err);
                        resolve(Number(this?.changes || 0));
                    }
                );
            });

            if (updated > 0) continue;

            await new Promise((resolve, reject) => {
                db.run(
                    "INSERT OR IGNORE INTO service_prices (service_type, amount, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                    [item.service_type, item.amount],
                    (err) => (err ? reject(err) : resolve())
                );
            });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Service prices update error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
