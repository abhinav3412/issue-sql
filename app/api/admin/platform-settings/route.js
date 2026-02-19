import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

export async function GET() {
    try {
        const db = getDB();
        const row = await new Promise((resolve) => {
            db.get("SELECT * FROM platform_settings WHERE id = 1", (err, r) => {
                if (err) return resolve(null);
                resolve(r || null);
            });
        });

        if (!row) {
            await new Promise((resolve) => {
                db.run("INSERT OR IGNORE INTO platform_settings (id) VALUES (1)", () => resolve());
            });
        }

        const settings = row || {
            delivery_fee_base: 50,
            platform_service_fee_percentage: 5,
            is_raining: 0,
            surge_night_multiplier: 1.5,
            surge_rain_multiplier: 1.3
        };
        return NextResponse.json(settings);
    } catch (err) {
        console.error("Platform settings fetch error:", err);
        return NextResponse.json({ error: "Failed to load platform settings" }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        const db = getDB();

        const is_raining = body.is_raining ? 1 : 0;
        const delivery_fee_base = Number(body.delivery_fee_base);
        const platform_service_fee_percentage = Number(body.platform_service_fee_percentage);
        const surge_night_multiplier = Number(body.surge_night_multiplier);
        const surge_rain_multiplier = Number(body.surge_rain_multiplier);

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE platform_settings SET 
          is_raining = ?, 
          delivery_fee_base = ?, 
          platform_service_fee_percentage = ?, 
          surge_night_multiplier = ?, 
          surge_rain_multiplier = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1`,
                [is_raining, delivery_fee_base, platform_service_fee_percentage, surge_night_multiplier, surge_rain_multiplier],
                (err) => (err ? reject(err) : resolve())
            );
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Platform settings update error:", err);
        return NextResponse.json({ error: "Failed to update platform settings" }, { status: 500 });
    }
}
