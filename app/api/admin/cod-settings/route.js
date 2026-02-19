import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

function ensureCodSettingsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS cod_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cod_limit INTEGER DEFAULT 500,
        trust_threshold REAL DEFAULT 50,
        max_failures INTEGER DEFAULT 3,
        disable_days INTEGER DEFAULT 7
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export async function GET() {
  try {
    const db = getDB();
    await ensureCodSettingsTable(db);

    const row = await new Promise((resolve) => {
      db.get("SELECT * FROM cod_settings WHERE id = 1", (err, r) => {
        if (err) return resolve(null);
        resolve(r || null);
      });
    });

    if (!row) {
      await new Promise((resolve) => {
        db.run("INSERT OR IGNORE INTO cod_settings (id) VALUES (1)", () => resolve());
      });
    }

    const settings = row || { cod_limit: 500, trust_threshold: 50, max_failures: 3, disable_days: 7 };
    return NextResponse.json(settings);
  } catch (err) {
    console.error("COD settings fetch error:", err);
    return NextResponse.json({ error: "Failed to load COD settings" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const db = getDB();
    await ensureCodSettingsTable(db);

    const cod_limit = Number(body.cod_limit);
    const trust_threshold = Number(body.trust_threshold);
    const max_failures = Number(body.max_failures);
    const disable_days = Number(body.disable_days);

    if ([cod_limit, trust_threshold, max_failures, disable_days].some((v) => Number.isNaN(v))) {
      return NextResponse.json({ error: "Invalid settings values" }, { status: 400 });
    }

    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO cod_settings (id, cod_limit, trust_threshold, max_failures, disable_days) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET cod_limit = excluded.cod_limit, trust_threshold = excluded.trust_threshold, max_failures = excluded.max_failures, disable_days = excluded.disable_days",
        [cod_limit, trust_threshold, max_failures, disable_days],
        (err) => (err ? reject(err) : resolve())
      );
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("COD settings update error:", err);
    return NextResponse.json({ error: "Failed to update COD settings" }, { status: 500 });
  }
}
