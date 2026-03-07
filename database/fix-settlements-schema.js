// Migration: Fix settlements table schema - remove NOT NULL constraint from service_request_id
// Run: node database/fix-settlements-schema.js

const { getDB } = require("./db");

const db = getDB();
const isPostgres = db.type === "postgres";
const isMySQL = db.type === "mysql";

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this || {});
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function closeDB() {
  return new Promise((resolve) => {
    if (typeof db.close !== "function") return resolve();
    db.close(() => resolve());
  });
}

function idPrimaryKey() {
  if (isPostgres) return "BIGSERIAL PRIMARY KEY";
  if (isMySQL) return "BIGINT PRIMARY KEY AUTO_INCREMENT";
  return "INTEGER PRIMARY KEY AUTOINCREMENT";
}

async function settlementsTableExists() {
  if (isPostgres) {
    const rows = await all(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ?`,
      ["settlements"]
    );
    return rows.length > 0;
  }
  if (isMySQL) {
    const rows = await all(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?`,
      ["settlements"]
    );
    return rows.length > 0;
  }
  return false;
}

async function migrate() {
  try {
    const exists = await settlementsTableExists();
    if (!exists) {
      console.log("Settlements table does not exist. No migration needed.");
      return;
    }

    console.log("Found existing settlements table. Starting migration...");

    const existingData = await all("SELECT * FROM settlements");
    console.log(`Backed up ${existingData.length} records`);

    await run("DROP TABLE IF EXISTS settlements");
    console.log("Old table dropped");

    await run(`
      CREATE TABLE IF NOT EXISTS settlements (
        id ${idPrimaryKey()},
        service_request_id INTEGER,
        worker_id INTEGER,
        fuel_station_id INTEGER,
        settlement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_request_id) REFERENCES service_requests(id),
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id)
      )
    `);
    console.log("New table created");

    for (const record of existingData) {
      await run(
        `INSERT INTO settlements (
          id, service_request_id, worker_id, fuel_station_id, settlement_date,
          customer_amount, fuel_cost, delivery_fee, platform_service_fee, surge_fee,
          fuel_station_payout, worker_payout, platform_profit,
          worker_base_pay, worker_distance_km, worker_distance_pay, worker_surge_bonus,
          worker_waiting_time_bonus, worker_incentive_bonus, worker_penalty, worker_minimum_guarantee,
          status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.service_request_id,
          record.worker_id,
          record.fuel_station_id,
          record.settlement_date,
          record.customer_amount,
          record.fuel_cost,
          record.delivery_fee,
          record.platform_service_fee,
          record.surge_fee,
          record.fuel_station_payout,
          record.worker_payout,
          record.platform_profit,
          record.worker_base_pay,
          record.worker_distance_km,
          record.worker_distance_pay,
          record.worker_surge_bonus,
          record.worker_waiting_time_bonus,
          record.worker_incentive_bonus,
          record.worker_penalty,
          record.worker_minimum_guarantee,
          record.status,
          record.notes,
          record.created_at,
          record.updated_at,
        ]
      );
    }
    console.log(`Restored ${existingData.length} records`);

    const indexes = [
      ["settlements_service_request", "settlements", "service_request_id"],
      ["settlements_worker", "settlements", "worker_id"],
      ["settlements_fuel_station", "settlements", "fuel_station_id"],
      ["settlements_status", "settlements", "status"],
      ["settlements_date", "settlements", "settlement_date"],
    ];
    for (const [name, table, column] of indexes) {
      try {
        await run(`CREATE INDEX IF NOT EXISTS idx_${name} ON ${table}(${column})`);
      } catch (err) {
        console.warn(`Index ${name}: ${err.message}`);
      }
    }

    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration error:", err.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

migrate();
