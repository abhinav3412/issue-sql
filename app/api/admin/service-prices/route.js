import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

export async function GET() {
    try {
        const db = getDB();
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
        for (const item of prices) {
            await new Promise((resolve, reject) => {
                db.run(
                    "INSERT OR REPLACE INTO service_prices (service_type, amount, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
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
