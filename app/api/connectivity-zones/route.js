const { getConnectivityDB, ensureConnectivitySchema } = require("../../../database/connectivity-db");

const CELL_SIZE_DEG = 0.03;
const MIN_REPORTS = 3;
const NONE_RATIO = 0.6;
const WINDOW_DAYS = 3;

function buildCellPolygon(cellX, cellY) {
  const minLat = cellX * CELL_SIZE_DEG;
  const maxLat = minLat + CELL_SIZE_DEG;
  const minLng = cellY * CELL_SIZE_DEG;
  const maxLng = minLng + CELL_SIZE_DEG;
  return [
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ],
  ];
}

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
      `,
      [cutoff],
      (err, rows) => {
        if (err) {
          resolve(new Response(JSON.stringify({ error: "DB query failed" }), { status: 500 }));
          return;
        }

        const buckets = new Map();
        for (const row of rows || []) {
          const cellX = Math.floor(row.lat / CELL_SIZE_DEG);
          const cellY = Math.floor(row.lng / CELL_SIZE_DEG);
          const key = `${cellX}:${cellY}`;
          const entry = buckets.get(key) || { cellX, cellY, total: 0, none: 0 };
          entry.total += 1;
          if (row.severity === "none") entry.none += 1;
          buckets.set(key, entry);
        }

        const features = [];
        for (const entry of buckets.values()) {
          if (entry.total < MIN_REPORTS) continue;
          const severity = entry.none / entry.total >= NONE_RATIO ? "none" : "weak";
          features.push({
            type: "Feature",
            properties: {
              severity,
              count: entry.total,
              window_days: WINDOW_DAYS,
            },
            geometry: {
              type: "Polygon",
              coordinates: buildCellPolygon(entry.cellX, entry.cellY),
            },
          });
        }

        resolve(
          new Response(
            JSON.stringify({
              type: "FeatureCollection",
              features,
            }),
            { status: 200 }
          )
        );
      }
    );
  });
}
