import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../database/db");
const { calculateSettlement } = require("../../../database/settlement-calculator");

const VALID_SERVICE_TYPES = ["petrol", "diesel", "crane", "mechanic_bike", "mechanic_car"];
const isDuplicateColumnError = (err) =>
  /duplicate column name|already exists|42701|ER_DUP_FIELDNAME/i.test(String(err?.message || ""));

function hasTableColumn(db, tableName, colName) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
      if (err) return resolve(false);
      const found = (rows || []).some(
        (c) => String(c.name || "").toLowerCase() === String(colName).toLowerCase()
      );
      resolve(found);
    });
  });
}

function ensureServiceRequestsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS service_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        vehicle_number VARCHAR(50) NOT NULL,
        driving_licence VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        service_type VARCHAR(50) NOT NULL,
        amount INTEGER NOT NULL,
        fuel_station_id INTEGER,
        payment_method VARCHAR(20) DEFAULT 'ONLINE',
        payment_status VARCHAR(30) DEFAULT 'PAID',
        cod_failure_reason VARCHAR(200),
        status VARCHAR(20) DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        assigned_at DATETIME,
        in_progress_at DATETIME,
        completed_at DATETIME,
        cancelled_at DATETIME,
        user_lat REAL,
        user_lon REAL,
        assigned_worker INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function ensureServiceRequestTimelineColumns(db) {
  const columns = [
    "assigned_at DATETIME",
    "in_progress_at DATETIME",
    "completed_at DATETIME",
    "cancelled_at DATETIME",
  ];
  return Promise.all(
    columns.map(
      (col) =>
        new Promise((resolve) => {
          db.run(`ALTER TABLE service_requests ADD COLUMN ${col}`, (err) => {
            if (err && !isDuplicateColumnError(err)) {
              console.error(`Add service_requests.${col} failed:`, err);
            }
            resolve();
          });
        })
    )
  );
}

function ensureServiceRequestPaymentColumns(db) {
  const cols = [
    "fuel_station_id INTEGER",
    "payment_method VARCHAR(20) DEFAULT 'ONLINE'",
    "payment_status VARCHAR(30) DEFAULT 'PAID'",
    "cod_failure_reason VARCHAR(200)",
    "payment_id VARCHAR(100)",
    "payment_details TEXT",
    "litres REAL",
    "fuel_price REAL",
  ];
  return Promise.all(
    cols.map(
      (col) =>
        new Promise((resolve) => {
          db.run(`ALTER TABLE service_requests ADD COLUMN ${col}`, (err) => {
            if (err && !isDuplicateColumnError(err)) {
              console.error(`Add service_requests.${col} failed:`, err);
            }
            resolve();
          });
        })
    )
  );
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

function ensureUserProfileColumns(db) {
  const cols = ["driving_licence VARCHAR(100)"];
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

function ensurePaymentsTable(db) {
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_request_id INTEGER NOT NULL,
        provider VARCHAR(50) NOT NULL,
        provider_payment_id VARCHAR(128),
        amount INTEGER NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(30) DEFAULT 'created',
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_request_id) REFERENCES service_requests(id)
      )`,
      (err) => {
        if (err && !/already exists/i.test(err.message)) {
          console.error("Create payments table failed:", err);
        }
        resolve();
      }
    );
  });
}

function ensureSettlementsTable(db) {
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_request_id INTEGER,
        worker_id INTEGER,
        fuel_station_id INTEGER,
        settlement_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        customer_amount INTEGER NOT NULL,
        fuel_cost INTEGER NOT NULL,
        delivery_fee INTEGER NOT NULL,
        platform_service_fee INTEGER NOT NULL,
        surge_fee INTEGER DEFAULT 0,
        fuel_station_payout INTEGER NOT NULL,
        worker_payout REAL NOT NULL,
        platform_profit INTEGER NOT NULL,
        worker_base_pay REAL DEFAULT 0,
        worker_distance_km REAL DEFAULT 0,
        worker_distance_pay REAL DEFAULT 0,
        worker_surge_bonus REAL DEFAULT 0,
        worker_waiting_time_bonus REAL DEFAULT 0,
        worker_incentive_bonus REAL DEFAULT 0,
        worker_penalty REAL DEFAULT 0,
        worker_minimum_guarantee REAL DEFAULT 0,
        status VARCHAR(30) DEFAULT 'calculated',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => {
        if (err && !/already exists/i.test(err.message)) console.error("Create settlements table failed:", err);
        resolve();
      }
    );
  });
}

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

function ensureFuelStationCodColumns(db) {
  const cols = [
    "cod_enabled INTEGER DEFAULT 1",
    "cod_supported INTEGER DEFAULT 1",
    "cod_delivery_allowed INTEGER DEFAULT 1",
    "cod_current_balance REAL DEFAULT 0",
    "cod_balance_limit REAL DEFAULT 50000",
    "platform_trust_flag INTEGER DEFAULT 1",
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

function ensureFuelStationsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS fuel_stations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255),
        station_name VARCHAR(255),
        latitude REAL,
        longitude REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
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

async function resolveNearestStation(db, lat, lng) {
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
  return nearest;
}

async function syncFuelStationCodBalance(db, fuelStationId) {
  if (!fuelStationId) return 0;

  const pending = await new Promise((resolve) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) AS pending_amount
       FROM service_requests
       WHERE fuel_station_id = ?
         AND payment_method = 'COD'
         AND payment_status = 'PENDING_COLLECTION'`,
      [fuelStationId],
      (err, row) => resolve(row || { pending_amount: 0 })
    );
  });

  const currentBalance = Number(pending.pending_amount || 0);
  const hasCodCurrentBalance = await hasTableColumn(db, "fuel_stations", "cod_current_balance");
  if (hasCodCurrentBalance) {
    const hasUpdatedAt = await hasTableColumn(db, "fuel_stations", "updated_at");
    await new Promise((resolve) => {
      const sql = hasUpdatedAt
        ? `UPDATE fuel_stations SET cod_current_balance = ?, updated_at = ? WHERE id = ?`
        : `UPDATE fuel_stations SET cod_current_balance = ? WHERE id = ?`;
      const params = hasUpdatedAt
        ? [currentBalance, getLocalDateTimeString(), fuelStationId]
        : [currentBalance, fuelStationId];
      db.run(sql, params, () => resolve());
    });
  }

  return currentBalance;
}

async function checkCodEligibility(db, { user_id, order_amount, user_lat, user_lon, fuel_station_id, service_type }) {
  const isFuel = service_type === 'petrol' || service_type === 'diesel';
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
      resolve(row || null);
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
      "SELECT id, trust_score, cod_failure_count, cod_disabled, cod_disabled_until FROM users WHERE id = ?",
      [user_id],
      (err, row) => {
        if (err) return resolve(null);
        resolve(row || null);
      }
    );
  });
  if (!user) return { allowed: false, reason: "user_not_found" };

  if (Number(user.trust_score ?? 0) < Number(cfg.trust_threshold)) {
    return { allowed: false, reason: "trust_score_low" };
  }
  if (user.cod_disabled) return { allowed: false, reason: "cod_disabled" };
  if (user.cod_disabled_until) {
    const until = new Date(user.cod_disabled_until);
    if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
      return { allowed: false, reason: "cod_disabled_until" };
    }
  }
  if (Number(user.cod_failure_count || 0) >= Number(cfg.max_failures)) {
    return { allowed: false, reason: "cod_fail_limit" };
  }
  if (Number(order_amount) > Number(cfg.cod_limit)) {
    return { allowed: false, reason: "order_amount_too_high" };
  }

  let station = null;
  if (fuel_station_id) {
    station = await new Promise((resolve) => {
      db.get("SELECT * FROM fuel_stations WHERE id = ?", [fuel_station_id], (err, row) => {
        if (err) return resolve(null);
        resolve(row || null);
      });
    });
  } else if (user_lat != null && user_lon != null) {
    station = await resolveNearestStation(db, Number(user_lat), Number(user_lon));
  }

  if (isFuel) {
    if (!station) return { allowed: false, reason: "fuel_station_not_found" };
    if (station.cod_supported === 0) return { allowed: false, reason: "fuel_station_no_cod" };
    if (station.cod_delivery_allowed === 0) return { allowed: false, reason: "location_not_supported" };

    const currentStationCodBalance = await syncFuelStationCodBalance(db, station.id);
    const projectedBalance = currentStationCodBalance + Number(order_amount || 0);
    if (projectedBalance > Number(station.cod_balance_limit || 0)) {
      return { allowed: false, reason: "fuel_station_cod_limit_exceeded" };
    }

    return { allowed: true, station };
  }

  // For non-fuel (Mechanic/Crane), we don't need a station
  return { allowed: true };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      user_id,
      vehicle_number,
      driving_licence,
      phone_number,
      service_type,
      user_lat,
      user_lon,
    } = body || {};

    if (!vehicle_number || String(vehicle_number).trim() === "") {
      return NextResponse.json(
        { error: "Vehicle number is required" },
        { status: 400 }
      );
    }
    if (!driving_licence || String(driving_licence).trim() === "") {
      return NextResponse.json(
        { error: "Driving licence is required" },
        { status: 400 }
      );
    }
    if (!phone_number || String(phone_number).trim() === "") {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }
    if (!service_type || !VALID_SERVICE_TYPES.includes(service_type)) {
      return NextResponse.json(
        {
          error:
            "Service type is required and must be one of: petrol, diesel, crane, mechanic_bike, mechanic_car",
        },
        { status: 400 }
      );
    }

    const bodyAmount = body?.amount ? Number(body.amount) : null;

    if (bodyAmount === null || Number.isNaN(bodyAmount) || bodyAmount <= 0) {
      return NextResponse.json({ error: "Amount is required" }, { status: 400 });
    }

    const amount = bodyAmount;

    const db = getDB();

    await ensureServiceRequestsTable(db);
    await ensureServiceRequestTimelineColumns(db);
    await ensureServiceRequestPaymentColumns(db);
    await ensureUserCodColumns(db);
    await ensureUserProfileColumns(db);
    await ensureCodSettingsTable(db);
    await ensureFuelStationCodColumns(db);
    await ensurePaymentsTable(db);
    await ensureSettlementsTable(db);
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

    const createdAt = getLocalDateTimeString();
    const sql =
      "INSERT INTO service_requests (user_id, vehicle_number, driving_licence, phone_number, service_type, amount, fuel_station_id, payment_method, payment_status, status, created_at, user_lat, user_lon, payment_id, payment_details, litres, fuel_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?)";
    const uid = user_id != null && user_id !== "" ? Number(user_id) : null;
    const paymentMethod = String(body?.payment_method || "ONLINE").toUpperCase();
    const fuelStationId = body?.fuel_station_id ?? null;
    const paymentId = body?.payment_id ?? null;
    const paymentDetailsString = body?.payment_details ? JSON.stringify(body.payment_details) : null;
    const litresValue = body?.litres ?? null;
    const fuelPriceValue = body?.fuel_price ?? null;

    if (paymentMethod === "ONLINE") {
      if (!paymentId) {
        return NextResponse.json({ error: "Missing Payment ID" }, { status: 400 });
      }

      // Pattern validation: Standard Razorpay payment IDs start with 'pay_'
      const payPattern = /^pay_[a-zA-Z0-9]+$/;
      if (!payPattern.test(paymentId)) {
        return NextResponse.json({ error: "Invalid Payment ID format" }, { status: 400 });
      }

      // Uniqueness check
      const alreadyUsed = await new Promise((resolve) => {
        db.get("SELECT id FROM service_requests WHERE payment_id = ?", [paymentId], (err, row) => {
          resolve(!!row);
        });
      });
      if (alreadyUsed) {
        return NextResponse.json({ error: "This Payment ID has already been used" }, { status: 409 });
      }

      // Verify payment amount with Razorpay
      try {
        const Razorpay = require("razorpay");
        const razorpay = new Razorpay({
          key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
          key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder_secret",
        });

        const payment = await razorpay.payments.fetch(paymentId);

        if (!payment) {
          return NextResponse.json({ error: "Payment not found" }, { status: 404 });
        }

        // Check if payment is captured or authorized
        if (payment.status !== "captured" && payment.status !== "authorized") {
          return NextResponse.json(
            { error: `Payment status is ${payment.status}, expected captured or authorized` },
            { status: 400 }
          );
        }

        // Verify amount (Razorpay amount is in paise)
        const expectedAmountPaise = Math.round(amount * 100);
        const paidAmountPaise = Number(payment.amount);
        const diff = Math.abs(paidAmountPaise - expectedAmountPaise);

        // Allow 1 INR margin for rounding errors
        if (diff > 100) {
          console.log("Payment amount mismatch:", {
            paymentId,
            paidAmountPaise,
            expectedAmountPaise,
            diff,
            amount
          });
          return NextResponse.json(
            {
              error: "Payment amount mismatch",
              details: `Paid: ${paidAmountPaise / 100}, Expected: ${amount}`
            },
            { status: 400 }
          );
        }
      } catch (error) {
        console.error("Razorpay verification failed:", error);
        // If credentials are invalid or network fails, we might want to block creation
        // assuming standard env.
        return NextResponse.json(
          { error: "Failed to verify payment with provider" },
          { status: 500 }
        );
      }
    }

    if (paymentMethod === "COD") {
      const eligibility = await checkCodEligibility(db, {
        user_id: uid,
        order_amount: amount,
        user_lat,
        user_lon,
        fuel_station_id: fuelStationId,
        service_type,
      });
      if (!eligibility.allowed) {
        return NextResponse.json(
          { error: "COD not allowed", reason: eligibility.reason },
          { status: 403 }
        );
      }
    }

    const paymentStatus = paymentMethod === "COD" ? "PENDING_COLLECTION" : "PAID";
    const params = [
      uid != null && !Number.isNaN(uid) ? uid : null,
      String(vehicle_number).trim(),
      String(driving_licence).trim(),
      String(phone_number).trim(),
      service_type,
      amount,
      fuelStationId,
      paymentMethod,
      paymentStatus,
      createdAt,
      user_lat || null,
      user_lon || null,
      paymentId,
      paymentDetailsString,
      litresValue,
      fuelPriceValue,
    ];

    const result = await new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      });
    });

    // Create payment record
    const paymentProvider = paymentMethod === "COD" ? "cod" : "razorpay";
    const paymentRecord = await new Promise((resolve) => {
      const now = getLocalDateTimeString();
      db.run(
        "INSERT INTO payments (service_request_id, provider, provider_payment_id, amount, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          result.id,
          paymentProvider,
          paymentId || null,
          amount,
          "INR",
          paymentMethod === "COD" ? "pending_collection" : "created",
          now,
          now,
        ],
        function (err) {
          if (err) {
            console.error("Payment record creation failed:", err);
          }
          resolve();
        }
      );
    });

    if (uid != null && !Number.isNaN(uid)) {
      const licenceValue = String(driving_licence).trim();
      if (licenceValue) {
        await new Promise((resolve) => {
          db.run(
            "UPDATE users SET driving_licence = ? WHERE id = ?",
            [licenceValue, uid],
            () => resolve()
          );
        });
      }
    }

    if (paymentMethod === "COD" && fuelStationId) {
      await syncFuelStationCodBalance(db, fuelStationId);
    }

    return NextResponse.json(
      {
        success: true,
        id: result.id,
        amount,
        service_type,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Service request create error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const db = getDB();
    await ensureServiceRequestsTable(db);
    await ensureServiceRequestTimelineColumns(db);
    await ensureServiceRequestPaymentColumns(db);
    await ensureSettlementsTable(db);
    await ensureFuelStationsTable(db);

    const url = request.url ? new URL(request.url) : null;
    const userIdParam = url?.searchParams?.get("user_id");
    const workerIdParam = url?.searchParams?.get("worker_id");
    const userId = userIdParam != null && userIdParam !== "" ? Number(userIdParam) : null;
    const workerId = workerIdParam != null && workerIdParam !== "" ? Number(workerIdParam) : null;

    const hasStationName = await hasTableColumn(db, "fuel_stations", "station_name");
    const hasStationLegacyName = await hasTableColumn(db, "fuel_stations", "name");
    const hasStationLatitude = await hasTableColumn(db, "fuel_stations", "latitude");
    const hasStationLongitude = await hasTableColumn(db, "fuel_stations", "longitude");
    const fuelStationNameExpr = hasStationName && hasStationLegacyName
      ? "COALESCE(fs.station_name, fs.name)"
      : hasStationName
        ? "fs.station_name"
        : hasStationLegacyName
          ? "fs.name"
          : "NULL";
    const fuelStationLatExpr = hasStationLatitude ? "fs.latitude" : "NULL";
    const fuelStationLonExpr = hasStationLongitude ? "fs.longitude" : "NULL";

    let sql = `
      SELECT sr.*, 
             u.first_name AS user_first_name, u.last_name AS user_last_name,
             ${fuelStationNameExpr} AS fuel_station_name, ${fuelStationLatExpr} AS fuel_station_lat, ${fuelStationLonExpr} AS fuel_station_lon,
             s.worker_payout
      FROM service_requests sr 
      LEFT JOIN users u ON sr.user_id = u.id
      LEFT JOIN fuel_stations fs ON sr.fuel_station_id = fs.id
      LEFT JOIN settlements s ON sr.id = s.service_request_id
    `;
    const params = [];
    const conditions = [];

    if (userId != null && !Number.isNaN(userId)) {
      conditions.push("sr.user_id = ?");
      params.push(userId);
    }

    if (workerId != null && !Number.isNaN(workerId)) {
      conditions.push("sr.assigned_worker = ?");
      params.push(workerId);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY sr.created_at DESC";

    const rows = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, r) => (err ? reject(err) : resolve(r || [])));
    });

    return NextResponse.json(rows);
  } catch (err) {
    console.error("Service requests list error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, status, assigned_worker, cod_failure_reason } = body || {};

    if (!id) {
      return NextResponse.json(
        { error: "ID is required" },
        { status: 400 }
      );
    }

    const db = getDB();
    await ensureServiceRequestTimelineColumns(db);
    await ensureServiceRequestPaymentColumns(db);
    await ensureUserCodColumns(db);
    await ensureCodSettingsTable(db);
    await ensureFuelStationCodColumns(db);
    await ensureSettlementsTable(db);
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
    if (assigned_worker != null && (status === "Assigned" || status === "In Progress")) {
      const currentRequest = await new Promise((resolve) => {
        db.get(
          "SELECT id, status, assigned_worker FROM service_requests WHERE id = ?",
          [id],
          (err, row) => {
            if (err) return resolve(null);
            resolve(row || null);
          }
        );
      });

      if (!currentRequest) {
        return NextResponse.json({ error: "Service request not found" }, { status: 404 });
      }

      if (currentRequest.assigned_worker && Number(currentRequest.assigned_worker) !== Number(assigned_worker)) {
        return NextResponse.json(
          { error: "Request already assigned to another worker", code: "REQUEST_ASSIGNED" },
          { status: 409 }
        );
      }

      const activeCount = await new Promise((resolve) => {
        db.get(
          "SELECT COUNT(*) as count FROM service_requests WHERE assigned_worker = ? AND status IN ('Assigned', 'In Progress') AND id != ?",
          [assigned_worker, id],
          (err, row) => {
            if (err) return resolve({ count: 0 });
            resolve(row || { count: 0 });
          }
        );
      });

      if (Number(activeCount?.count || 0) > 0) {
        return NextResponse.json(
          { error: "Worker already has an active job", code: "WORKER_BUSY" },
          { status: 409 }
        );
      }
    }

    let sql = "UPDATE service_requests SET ";
    const params = [];
    const fields = [];

    if (status) {
      fields.push("status = ?");
      params.push(status);
      const now = getLocalDateTimeString();
      if (status === "Assigned") {
        fields.push("assigned_at = ?");
        params.push(now);
      } else if (status === "In Progress") {
        fields.push("in_progress_at = ?");
        params.push(now);
      } else if (status === "Completed") {
        fields.push("completed_at = ?");
        params.push(now);
      } else if (status === "Cancelled") {
        fields.push("cancelled_at = ?");
        params.push(now);
      }
    }
    if (assigned_worker !== undefined) {
      fields.push("assigned_worker = ?");
      params.push(assigned_worker);
    }

    // --- NEW: Automatic Refund Logic for Cancellation ---
    if (status === "Cancelled") {
      const currentRequest = await new Promise((resolve) => {
        db.get(
          "SELECT payment_method, payment_status, payment_id, amount FROM service_requests WHERE id = ?",
          [id],
          (err, row) => resolve(row)
        );
      });

      if (
        currentRequest &&
        currentRequest.payment_method === "ONLINE" &&
        currentRequest.payment_status === "PAID" &&
        currentRequest.payment_id
      ) {
        try {
          // Import Razorpay here to keep it server-side only
          const Razorpay = require("razorpay");
          const razorpay = new Razorpay({
            key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
            key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder_secret",
          });

          // Process Refund via Razorpay
          await razorpay.payments.refund(currentRequest.payment_id, {
            notes: {
              reason: "User cancelled service request",
              service_request_id: id
            }
          });

          // Update DB status to REFUNDED
          fields.push("payment_status = ?");
          params.push("REFUNDED");

          // Log refund in payments table
          const now = getLocalDateTimeString();
          await new Promise((resolve) => {
            db.run(
              "UPDATE payments SET status = 'refunded', updated_at = ? WHERE provider_payment_id = ?",
              [now, currentRequest.payment_id],
              () => resolve()
            );
          });

          console.log(`Refund processed for Request #${id}, Payment ID: ${currentRequest.payment_id}`);

        } catch (refundErr) {
          console.error(`Refund failed for Request #${id}:`, refundErr);
          // We still cancel the request, but maybe log the refund failure or flag it for manual review
          // Ideally, we'd have a 'refund_failed' status, but sticking to 'Cancelled' with error log for now.
        }
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    sql += fields.join(", ") + " WHERE id = ?";
    params.push(id);

    await new Promise((resolve, reject) => {
      db.run(sql, params, async (err) => {
        if (err) return reject(err);

        // Auto-assign fuel station if needed
        if (status === "Assigned" || status === "In Progress") {
          try {
            const req = await new Promise((resolve) => {
              db.get("SELECT * FROM service_requests WHERE id = ?", [id], (err, row) => resolve(row));
            });

            if (req && (req.service_type === 'petrol' || req.service_type === 'diesel') && !req.fuel_station_id) {
              const { selectFuelStation } = require("../../../database/fuel-station-selector");
              const worker = await new Promise((resolve) => {
                db.get("SELECT latitude, longitude FROM workers WHERE id = ?", [req.assigned_worker], (err, row) => resolve(row));
              });

              if (worker && worker.latitude && worker.longitude) {
                const selection = await selectFuelStation({
                  db,
                  worker_lat: worker.latitude,
                  worker_lng: worker.longitude,
                  fuel_type: req.service_type,
                  litres: req.litres || 5,
                  is_cod: req.payment_method === 'COD',
                  max_radius_km: 15,
                  fallback_to_prepaid: true
                });

                if (selection.success) {
                  db.run("UPDATE service_requests SET fuel_station_id = ? WHERE id = ?", [selection.station.id, id]);
                }
              }
            }
          } catch (e) {
            console.error("Auto-assignment failed:", e);
          }
        }
        resolve();
      });
    });

    const updated = await new Promise((resolve) => {
      db.get(
        "SELECT user_id, payment_method FROM service_requests WHERE id = ?",
        [id],
        (err, row) => {
          if (err) return resolve(null);
          resolve(row || null);
        }
      );
    });

    // Create settlement record when order is completed
    if (status === "Completed") {
      const serviceRequestFull = await new Promise((resolve) => {
        db.get(
          "SELECT * FROM service_requests WHERE id = ?",
          [id],
          (err, row) => resolve(row || null)
        );
      });

      if (serviceRequestFull && serviceRequestFull.assigned_worker) {
        // Parse original details to ensure we use identical components
        const originalDetails = serviceRequestFull.payment_details ? JSON.parse(serviceRequestFull.payment_details) : null;

        // Calculate settlement using original components as overrides
        const settlement = calculateSettlement({
          serviceRequestId: id,
          serviceType: serviceRequestFull.service_type,
          litres: serviceRequestFull.litres || (originalDetails?.fuel_cost ? 1 : 0),
          fuelPricePerLitre: serviceRequestFull.fuel_price || (originalDetails?.fuel_cost || 0),
          deliveryFeeOverride: serviceRequestFull.service_type === 'petrol' || serviceRequestFull.service_type === 'diesel' ? (originalDetails?.delivery_fee ?? null) : 0,
          platformServiceFeeOverride: serviceRequestFull.service_type === 'petrol' || serviceRequestFull.service_type === 'diesel' ? (originalDetails?.platform_service_fee ?? null) : serviceRequestFull.amount,
          surgeFeeOverride: originalDetails?.surge_fee ?? null,
          distanceKm: serviceRequestFull.distance_km || 0,
          waitingTimeMinutes: serviceRequestFull.waiting_time_minutes || 0,
          workerDeliveriesCompleted: serviceRequestFull.completed_delivery_count || 0,
        });

        // Create settlement record
        const now = getLocalDateTimeString();
        await new Promise((resolve) => {
          db.run(
            `INSERT INTO settlements (
              service_request_id, worker_id, fuel_station_id, settlement_date,
              customer_amount, fuel_cost, delivery_fee, platform_service_fee, surge_fee,
              fuel_station_payout, worker_payout, platform_profit,
              worker_base_pay, worker_distance_km, worker_distance_pay, worker_surge_bonus,
              worker_waiting_time_bonus, worker_incentive_bonus, worker_penalty, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              serviceRequestFull.assigned_worker,
              serviceRequestFull.fuel_station_id,
              now,
              settlement.customer.total,
              settlement.customer.fuel_cost,
              settlement.customer.delivery_fee,
              settlement.customer.platform_service_fee,
              settlement.customer.surge_fee,
              settlement.fuel_station.payout,
              settlement.worker.total,
              settlement.platform.profit,
              settlement.worker.base_pay,
              settlement.worker.distance_km,
              settlement.worker.distance_pay,
              settlement.worker.surge_bonus,
              settlement.worker.waiting_time_bonus,
              settlement.worker.incentive_bonus,
              settlement.worker.penalties,
              "calculated",
              now,
              now,
            ],
            (err) => {
              if (err) {
                console.error("Settlement record creation failed:", err);
              }
              resolve();
            }
          );
        });

        // --- NEW: Update Fuel Station Stock and Earnings ---
        if (serviceRequestFull.fuel_station_id && (serviceRequestFull.service_type === 'petrol' || serviceRequestFull.service_type === 'diesel')) {
          const litres = settlement.customer.fuel_cost > 0 ? (serviceRequestFull.litres || originalDetails?.litres || (settlement.customer.fuel_cost / (serviceRequestFull.fuel_price || 100))) : 0;

          if (litres > 0) {
            // 1. Decrease stock
            await new Promise((resolve) => {
              db.run(
                "UPDATE fuel_station_stock SET stock_litres = stock_litres - ?, updated_at = ? WHERE fuel_station_id = ? AND fuel_type = ?",
                [litres, now, serviceRequestFull.fuel_station_id, serviceRequestFull.service_type],
                (err) => {
                  if (err) console.error("Stock update failed:", err);
                  resolve();
                }
              );
            });
          }

          // 2. Update Fuel Station Balance
          const stationPayout = settlement.fuel_station.payout;
          if (stationPayout > 0) {
            await new Promise((resolve) => {
              db.run(
                "UPDATE fuel_stations SET total_earnings = COALESCE(total_earnings, 0) + ?, pending_payout = COALESCE(pending_payout, 0) + ?, updated_at = ? WHERE id = ?",
                [stationPayout, stationPayout, now, serviceRequestFull.fuel_station_id],
                (err) => {
                  if (err) console.error("Station balance update failed:", err);
                  resolve();
                }
              );
            });

            // 3. Log in Ledger
            await new Promise((resolve) => {
              db.run(
                `INSERT INTO fuel_station_ledger (
                  fuel_station_id, transaction_type, amount, description, status, reference_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  serviceRequestFull.fuel_station_id,
                  'sale',
                  stationPayout,
                  `Sale: ${litres.toFixed(1)}L ${serviceRequestFull.service_type} for Request #${id}`,
                  'pending',
                  id,
                  now,
                  now
                ],
                (err) => {
                  if (err) console.error("Ledger log failed:", err);
                  resolve();
                }
              );
            });
          }
        }

        // Update service request with completed delivery count
        await new Promise((resolve) => {
          db.run(
            "UPDATE service_requests SET completed_delivery_count = COALESCE(completed_delivery_count, 0) + 1 WHERE id = ?",
            [id],
            () => resolve()
          );
        });

        // --- NEW: Update Worker Pending Balance ---
        const workerPayout = settlement.worker.total;
        if (workerPayout > 0 && serviceRequestFull.assigned_worker) {
          await new Promise((resolve) => {
            db.run(
              "UPDATE workers SET pending_balance = COALESCE(pending_balance, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              [workerPayout, serviceRequestFull.assigned_worker],
              (err) => {
                if (err) console.error("Worker pending balance update failed:", err);
                resolve();
              }
            );
          });
        }
      }
    }

    if (updated && updated.payment_method === "COD") {
      if (status === "Completed") {
        await new Promise((resolve) => {
          db.run(
            "UPDATE service_requests SET payment_status = 'PAID' WHERE id = ?",
            [id],
            () => resolve()
          );
        });
        // Added: Update worker floater cash
        await new Promise((resolve) => {
          db.get(
            "SELECT amount, assigned_worker FROM service_requests WHERE id = ?",
            [id],
            (err, row) => {
              if (row && row.assigned_worker) {
                db.run(
                  "UPDATE workers SET floater_cash = COALESCE(floater_cash, 0) + ? WHERE id = ?",
                  [row.amount, row.assigned_worker],
                  () => resolve()
                );
              } else {
                resolve();
              }
            }
          );
        });
        await new Promise((resolve) => {
          db.run(
            "UPDATE users SET trust_score = COALESCE(trust_score, 50) + 5, cod_success_count = COALESCE(cod_success_count, 0) + 1 WHERE id = ?",
            [updated.user_id],
            () => resolve()
          );
        });
      } else if (status === "Cancelled" && cod_failure_reason) {
        await new Promise((resolve) => {
          db.run(
            "UPDATE service_requests SET payment_status = 'FAILED_COD', cod_failure_reason = ? WHERE id = ?",
            [String(cod_failure_reason).slice(0, 200), id],
            () => resolve()
          );
        });
        await new Promise((resolve) => {
          db.run(
            "UPDATE users SET trust_score = COALESCE(trust_score, 50) - 10, cod_failure_count = COALESCE(cod_failure_count, 0) + 1, cod_last_failure_reason = ? WHERE id = ?",
            [String(cod_failure_reason).slice(0, 200), updated.user_id],
            () => resolve()
          );
        });

        const settings = await new Promise((resolve) => {
          db.get("SELECT * FROM cod_settings WHERE id = 1", (err, row) => {
            if (err) return resolve(null);
            resolve(row || null);
          });
        });
        if (settings) {
          const user = await new Promise((resolve) => {
            db.get(
              "SELECT cod_failure_count FROM users WHERE id = ?",
              [updated.user_id],
              (err, row) => {
                if (err) return resolve(null);
                resolve(row || null);
              }
            );
          });
          if (user && Number(user.cod_failure_count || 0) >= Number(settings.max_failures || 3)) {
            const disableDays = Number(settings.disable_days || 7);
            const until = new Date(Date.now() + disableDays * 24 * 60 * 60 * 1000);
            const untilStr = until.toISOString().slice(0, 19).replace("T", " ");
            await new Promise((resolve) => {
              db.run(
                "UPDATE users SET cod_disabled = 1, cod_disabled_until = ? WHERE id = ?",
                [untilStr, updated.user_id],
                () => resolve()
              );
        });
      }

      if (updated.fuel_station_id) {
        await syncFuelStationCodBalance(db, updated.fuel_station_id);
      }
    }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Service request update error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
