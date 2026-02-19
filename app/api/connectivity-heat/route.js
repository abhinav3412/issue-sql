const { getConnectivityDB, ensureConnectivitySchema } = require("../../../database/connectivity-db");

const WINDOW_DAYS = 3;
const MAX_POINTS = 1000;

export async function GET() {
  try {
    await ensureConnectivitySchema();
  } catch (err) {
    return new Response(JSON.stringify({ error: "DB init failed" }), { status: 500 });
  }

  const db = getConnectivityDB();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return await new Promise((resolve) => {
    db.all(
      `
        SELECT lat, lng, severity
        FROM connectivity_reports
        WHERE reported_at >= ?
        ORDER BY reported_at DESC
        LIMIT ?
      `,
      [cutoff, MAX_POINTS],
      (err, rows) => {
        if (err) {
          resolve(new Response(JSON.stringify({ error: "DB query failed" }), { status: 500 }));
          return;
        }

        const points = (rows || []).map((row) => ({
          lat: row.lat,
          lng: row.lng,
          intensity: row.severity === "none" ? 1.0 : 0.6,
        }));

        resolve(new Response(JSON.stringify({ points }), { status: 200 }));
      }
    );
  });
}
