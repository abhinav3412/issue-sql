const { getConnectivityDB, ensureConnectivitySchema } = require("../../../database/connectivity-db");

function readJson(req) {
  return req.json().catch(() => null);
}

export async function POST(req) {
  try {
    await ensureConnectivitySchema();
  } catch (err) {
    return new Response(JSON.stringify({ error: "DB init failed" }), { status: 500 });
  }

  const body = await readJson(req);
  if (!body) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const {
    lat,
    lng,
    severity,
    effectiveType = null,
    downlink = null,
    rtt = null,
    failures = 0,
    offline = 0,
  } = body;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return new Response(JSON.stringify({ error: "lat/lng required" }), { status: 400 });
  }

  if (severity !== "weak" && severity !== "none") {
    return new Response(JSON.stringify({ error: "invalid severity" }), { status: 400 });
  }

  const db = getConnectivityDB();
  const reportedAt = new Date().toISOString();

  return await new Promise((resolve) => {
    db.run(
      `
        INSERT INTO connectivity_reports
          (lat, lng, severity, effective_type, downlink, rtt, failures, offline, reported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [lat, lng, severity, effectiveType, downlink, rtt, failures, offline ? 1 : 0, reportedAt],
      function (err) {
        if (err) {
          resolve(new Response(JSON.stringify({ error: "DB insert failed" }), { status: 500 }));
          return;
        }
        resolve(new Response(JSON.stringify({ ok: true, id: this.lastID }), { status: 201 }));
      }
    );
  });
}
