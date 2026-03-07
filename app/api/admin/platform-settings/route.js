import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

function runAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });
}

function getAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
    });
}

function allAsync(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
}

async function hasIsRainingColumn(db) {
    if (db.type === "postgres") {
        const row = await getAsync(
            db,
            `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'platform_settings'
         AND column_name = 'is_raining'
       LIMIT 1`
        );
        return !!row;
    }

    if (db.type === "mysql") {
        const row = await getAsync(
            db,
            `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'platform_settings'
         AND column_name = 'is_raining'
       LIMIT 1`
        );
        return !!row;
    }

    const rows = await allAsync(db, "PRAGMA table_info(platform_settings)");
    return rows.some((r) => r.name === "is_raining");
}

async function ensurePlatformSettingsRainColumn(db) {
    const exists = await hasIsRainingColumn(db);
    if (exists) return;

    if (db.type === "postgres") {
        await runAsync(db, "ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS is_raining INTEGER DEFAULT 0");
        return;
    }

    if (db.type === "mysql") {
        await runAsync(db, "ALTER TABLE platform_settings ADD COLUMN is_raining TINYINT(1) DEFAULT 0");
        return;
    }

    await runAsync(db, "ALTER TABLE platform_settings ADD COLUMN is_raining INTEGER DEFAULT 0");
}

export async function GET() {
    try {
        const db = getDB();
        await ensurePlatformSettingsRainColumn(db);
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
        await ensurePlatformSettingsRainColumn(db);

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
