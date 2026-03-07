import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

const isDuplicateColumnError = (err) =>
  /duplicate column name|already exists|42701|ER_DUP_FIELDNAME/i.test(String(err?.message || ""));

function ensureUserCodColumns(db) {
  const cols = [
    "trust_score REAL DEFAULT 50",
    "cod_success_count INTEGER DEFAULT 0",
    "cod_failure_count INTEGER DEFAULT 0",
    "cod_last_failure_reason VARCHAR(200)",
    "cod_disabled INTEGER DEFAULT 0",
    "cod_disabled_until DATETIME",
  ];
  return Promise.all(
    cols.map(
      (col) =>
        new Promise((resolve) => {
          db.run(`ALTER TABLE users ADD COLUMN ${col}`, (err) => {
            if (err && !isDuplicateColumnError(err)) {
              console.error(`Add users.${col} failed:`, err);
            }
            resolve();
          });
        })
    )
  );
}

export async function GET() {
  try {
    const db = getDB();
    await ensureUserCodColumns(db);

    const users = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, email, first_name, last_name, trust_score, cod_success_count, cod_failure_count, cod_last_failure_reason, cod_disabled, cod_disabled_until
         FROM users
         WHERE role = 'User'
           AND NOT EXISTS (
             SELECT 1 FROM fuel_stations fs WHERE fs.user_id = users.id
           )
         ORDER BY cod_failure_count DESC, trust_score ASC`,
        [],
        (err, rows) => (err ? reject(err) : resolve(rows ?? []))
      );
    });

    return NextResponse.json(users);
  } catch (err) {
    console.error("COD users fetch error:", err);
    return NextResponse.json({ error: "Failed to load COD users" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { user_id, cod_disabled, reset_counts } = body || {};

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const db = getDB();
    await ensureUserCodColumns(db);

    const fields = [];
    const params = [];

    if (cod_disabled !== undefined) {
      fields.push("cod_disabled = ?");
      params.push(Number(Boolean(cod_disabled)));
      if (!cod_disabled) {
        fields.push("cod_disabled_until = NULL");
      }
    }

    if (reset_counts) {
      fields.push("cod_success_count = 0");
      fields.push("cod_failure_count = 0");
      fields.push("cod_last_failure_reason = NULL");
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No updates" }, { status: 400 });
    }

    const sql = `UPDATE users
                 SET ${fields.join(", ")}
                 WHERE id = ?
                   AND role = 'User'
                   AND NOT EXISTS (
                     SELECT 1 FROM fuel_stations fs WHERE fs.user_id = users.id
                   )`;
    params.push(user_id);

    const result = await new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });

    if (!result.changes) {
      return NextResponse.json({ error: "User not found or not eligible for COD controls" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("COD user update error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
