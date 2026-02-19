// Migration: Add payments, settlements, and worker configuration for settlement algorithm
// Run: node database/migrate-payments-settlement.js

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

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
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

function isDuplicateColumnError(err) {
  return /(duplicate column name|already exists|ER_DUP_FIELDNAME|42701)/i.test(String(err?.message || ""));
}

async function migrate() {
  try {
    console.log("Creating payments table...");
    await run(`
      CREATE TABLE IF NOT EXISTS payments (
        id ${idPrimaryKey()},
        service_request_id INTEGER NOT NULL,
        provider VARCHAR(50) NOT NULL,
        provider_payment_id VARCHAR(128),
        amount INTEGER NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(30) DEFAULT 'created',
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_request_id) REFERENCES service_requests(id)
      )
    `);
    console.log("Table payments ready.");

    console.log("Creating settlements table...");
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
    console.log("Table settlements ready.");

    console.log("Adding worker payout configuration columns...");
    const workerCols = [
      "base_pay_per_order REAL DEFAULT 50",
      "per_km_rate REAL DEFAULT 10",
      "surge_split_percentage REAL DEFAULT 50",
      "peak_hour_bonus_percentage REAL DEFAULT 20",
      "long_distance_bonus_km REAL DEFAULT 15",
      "long_distance_bonus REAL DEFAULT 100",
      "incentive_threshold_deliveries INTEGER DEFAULT 10",
      "incentive_bonus REAL DEFAULT 200",
      "minimum_guaranteed_pay REAL DEFAULT 100",
      "cancellation_penalty REAL DEFAULT 50",
      "late_penalty_per_minute REAL DEFAULT 2",
    ];

    for (const col of workerCols) {
      try {
        await run(`ALTER TABLE workers ADD COLUMN ${col}`);
        console.log(`  Added ${col.split(" ")[0]}`);
      } catch (err) {
        if (!isDuplicateColumnError(err)) {
          console.warn(`  ${col.split(" ")[0]}: ${err.message}`);
        }
      }
    }

    console.log("Adding service request settlement columns...");
    const srCols = [
      "settlement_id INTEGER",
      "distance_km REAL",
      "waiting_time_minutes INTEGER DEFAULT 0",
      "delivery_fee_override INTEGER",
      "platform_service_fee_override INTEGER",
      "surge_fee_override INTEGER",
      "completed_delivery_count INTEGER DEFAULT 0",
    ];

    for (const col of srCols) {
      try {
        await run(`ALTER TABLE service_requests ADD COLUMN ${col}`);
        console.log(`  Added ${col.split(" ")[0]}`);
      } catch (err) {
        if (!isDuplicateColumnError(err)) {
          console.warn(`  ${col.split(" ")[0]}: ${err.message}`);
        }
      }
    }

    console.log("Creating platform settings table...");
    await run(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        delivery_fee_base INTEGER DEFAULT 50,
        platform_service_fee_percentage REAL DEFAULT 5,
        surge_enabled INTEGER DEFAULT 1,
        surge_night_start VARCHAR(5) DEFAULT '21:00',
        surge_night_end VARCHAR(5) DEFAULT '06:00',
        surge_night_multiplier REAL DEFAULT 1.5,
        surge_rain_multiplier REAL DEFAULT 1.3,
        surge_emergency_multiplier REAL DEFAULT 2.0,
        platform_margin_target_percentage REAL DEFAULT 15,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Table platform_settings ready.");

    const existingSettings = await get("SELECT id FROM platform_settings WHERE id = 1");
    if (!existingSettings) {
      await run("INSERT INTO platform_settings (id) VALUES (1)");
      console.log("Platform settings initialized with defaults.");
    }

    console.log("Creating indexes...");
    const indexes = [
      ["payments_service_request", "payments", "service_request_id"],
      ["payments_provider_id", "payments", "provider_payment_id"],
      ["payments_status", "payments", "status"],
      ["settlements_service_request", "settlements", "service_request_id"],
      ["settlements_worker", "settlements", "worker_id"],
      ["settlements_fuel_station", "settlements", "fuel_station_id"],
      ["settlements_status", "settlements", "status"],
      ["settlements_date", "settlements", "settlement_date"],
    ];

    for (const [name, table, column] of indexes) {
      try {
        await run(`CREATE INDEX IF NOT EXISTS idx_${name} ON ${table}(${column})`);
        console.log(`  Index ${name}`);
      } catch (err) {
        console.warn(`  Index ${name}: ${err.message}`);
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
