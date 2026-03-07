import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

const isDuplicateColumnError = (err) =>
  /duplicate column name|already exists|42701|ER_DUP_FIELDNAME/i.test(String(err?.message || ""));

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

function ensureFuelStationCodColumns(db) {
  const cols = [
    "cod_supported INTEGER DEFAULT 1",
    "cod_delivery_allowed INTEGER DEFAULT 1",
  ];
  return Promise.all(
    cols.map(
      (col) =>
        new Promise((resolve) => {
          db.run(`ALTER TABLE fuel_stations ADD COLUMN ${col}`, (err) => {
            if (err && !isDuplicateColumnError(err)) {
              console.error(`Add fuel_stations.${col} failed:`, err);
            }
            resolve();
          });
        })
    )
  );
}

const toRadians = (v) => (v * Math.PI) / 180;
const distanceMeters = (a, b) => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * 6371000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("user_id");
    const orderAmountParam = url.searchParams.get("order_amount");
    const locationParam = url.searchParams.get("location");
    const stationIdParam = url.searchParams.get("fuelstation_id");
    const locationAllowsParam = url.searchParams.get("location_allows_cod");

    const orderAmount = Number(orderAmountParam);
    if (!userId || Number.isNaN(Number(userId))) {
      return NextResponse.json({ cod_allowed: false, reason: "invalid_user" }, { status: 400 });
    }
    if (Number.isNaN(orderAmount)) {
      return NextResponse.json({ cod_allowed: false, reason: "invalid_amount" }, { status: 400 });
    }

    const db = getDB();
    await ensureCodSettingsTable(db);
    await ensureUserCodColumns(db);
    await ensureFuelStationCodColumns(db);
    await new Promise((resolve) => {
      db.run("UPDATE users SET trust_score = 50 WHERE trust_score IS NULL", () => resolve());
    });
    await new Promise((resolve) => {
      db.run("UPDATE users SET cod_success_count = 0 WHERE cod_success_count IS NULL", () => resolve());
    });
    await new Promise((resolve) => {
      db.run("UPDATE users SET cod_failure_count = 0 WHERE cod_failure_count IS NULL", () => resolve());
    });
    await new Promise((resolve) => {
      db.run("UPDATE users SET cod_disabled = 0 WHERE cod_disabled IS NULL", () => resolve());
    });
    await new Promise((resolve) => {
      db.run("UPDATE fuel_stations SET cod_supported = 1 WHERE cod_supported IS NULL", () => resolve());
    });
    await new Promise((resolve) => {
      db.run("UPDATE fuel_stations SET cod_delivery_allowed = 1 WHERE cod_delivery_allowed IS NULL", () => resolve());
    });

    const settings = await new Promise((resolve) => {
      db.get("SELECT * FROM cod_settings WHERE id = 1", (err, row) => {
        if (err) return resolve(null);
        return resolve(row || null);
      });
    });
    if (!settings) {
      await new Promise((resolve) => {
        db.run("INSERT OR IGNORE INTO cod_settings (id) VALUES (1)", () => resolve());
      });
    }
    const cfg = settings || { cod_limit: 500, trust_threshold: 50, max_failures: 3, disable_days: 7 };

    const user = await new Promise((resolve) => {
      db.get(
        "SELECT id, trust_score, cod_success_count, cod_failure_count, cod_disabled, cod_disabled_until FROM users WHERE id = ?",
        [userId],
        (err, row) => {
          if (err) return resolve(null);
          resolve(row || null);
        }
      );
    });

    if (!user) {
      return NextResponse.json({ cod_allowed: false, reason: "user_not_found" }, { status: 404 });
    }

    const trustScore = Number(user.trust_score ?? 0);
    if (trustScore < Number(cfg.trust_threshold)) {
      return NextResponse.json({ cod_allowed: false, reason: "trust_score_low" });
    }

    if (user.cod_disabled) {
      return NextResponse.json({ cod_allowed: false, reason: "cod_disabled" });
    }

    if (user.cod_disabled_until) {
      const until = new Date(user.cod_disabled_until);
      if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
        return NextResponse.json({ cod_allowed: false, reason: "cod_disabled_until" });
      }
    }

    if (Number(user.cod_failure_count || 0) >= Number(cfg.max_failures)) {
      return NextResponse.json({ cod_allowed: false, reason: "cod_fail_limit" });
    }

    if (orderAmount > Number(cfg.cod_limit)) {
      return NextResponse.json({ cod_allowed: false, reason: "order_amount_too_high" });
    }

    if (locationAllowsParam && String(locationAllowsParam).toLowerCase() === "false") {
      return NextResponse.json({ cod_allowed: false, reason: "location_not_supported" });
    }

    let station = null;
    if (stationIdParam) {
      station = await new Promise((resolve) => {
        db.get("SELECT * FROM fuel_stations WHERE id = ?", [stationIdParam], (err, row) => {
          if (err) return resolve(null);
          resolve(row || null);
        });
      });
    } else if (locationParam) {
      const [latStr, lngStr] = String(locationParam).split(",");
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        const stations = await new Promise((resolve) => {
          db.all("SELECT * FROM fuel_stations", (err, rows) => {
            if (err) return resolve([]);
            resolve(rows || []);
          });
        });
        let nearest = null;
        let nearestDist = Infinity;
        stations.forEach((s) => {
          if (s.latitude == null || s.longitude == null) return;
          const d = distanceMeters({ lat, lng }, { lat: s.latitude, lng: s.longitude });
          if (d < nearestDist) {
            nearestDist = d;
            nearest = s;
          }
        });
        station = nearest;
      }
    }

    if (!station) {
      return NextResponse.json({ cod_allowed: false, reason: "fuel_station_not_found" });
    }

    if (station.cod_supported === 0) {
      return NextResponse.json({ cod_allowed: false, reason: "fuel_station_no_cod" });
    }

    if (station.cod_delivery_allowed === 0) {
      return NextResponse.json({ cod_allowed: false, reason: "location_not_supported" });
    }

    return NextResponse.json({
      cod_allowed: true,
      reason: "ok",
      fuel_station_id: station.id,
    });
  } catch (err) {
    console.error("COD eligibility error:", err);
    return NextResponse.json({ cod_allowed: false, reason: "server_error" }, { status: 500 });
  }
}
