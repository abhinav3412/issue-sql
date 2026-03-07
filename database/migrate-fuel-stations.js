// Migration: Add Fuel Station role and tables
// Run: node database/migrate-fuel-stations.js

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
    console.log("Updating users table role compatibility...");
    try {
      await run("ALTER TABLE users ADD COLUMN role_old VARCHAR(20)");
      await run("UPDATE users SET role_old = role");
      console.log("Role snapshot column created.");
    } catch (err) {
      if (!isDuplicateColumnError(err)) {
        console.warn(`Role update: ${err.message}`);
      }
    }

    console.log("Creating fuel_stations table...");
    await run(`
      CREATE TABLE IF NOT EXISTS fuel_stations (
        id ${idPrimaryKey()},
        user_id INTEGER UNIQUE,
        station_name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        phone_number VARCHAR(20),
        address TEXT,
        latitude REAL,
        longitude REAL,
        cod_enabled INTEGER DEFAULT 1,
        cod_current_balance REAL DEFAULT 0,
        cod_balance_limit REAL DEFAULT 50000,
        is_verified INTEGER DEFAULT 0,
        is_open INTEGER DEFAULT 1,
        platform_trust_flag INTEGER DEFAULT 0,
        total_earnings REAL DEFAULT 0,
        pending_payout REAL DEFAULT 0,
        last_stock_update TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("Table fuel_stations created.");

    console.log("Creating fuel_station_stock table...");
    await run(`
      CREATE TABLE IF NOT EXISTS fuel_station_stock (
        id ${idPrimaryKey()},
        fuel_station_id INTEGER NOT NULL,
        fuel_type VARCHAR(50) NOT NULL,
        stock_litres REAL DEFAULT 0,
        last_refilled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(fuel_station_id, fuel_type),
        FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id) ON DELETE CASCADE
      )
    `);
    console.log("Table fuel_station_stock created.");

    console.log("Creating fuel_station_ledger table...");
    await run(`
      CREATE TABLE IF NOT EXISTS fuel_station_ledger (
        id ${idPrimaryKey()},
        fuel_station_id INTEGER NOT NULL,
        settlement_id INTEGER,
        transaction_type VARCHAR(50) NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        running_balance REAL DEFAULT 0,
        status VARCHAR(30) DEFAULT 'pending',
        reference_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id) ON DELETE CASCADE,
        FOREIGN KEY (settlement_id) REFERENCES settlements(id)
      )
    `);
    console.log("Table fuel_station_ledger created.");

    console.log("Creating cod_settlements table...");
    await run(`
      CREATE TABLE IF NOT EXISTS cod_settlements (
        id ${idPrimaryKey()},
        service_request_id INTEGER NOT NULL,
        fuel_station_id INTEGER NOT NULL,
        worker_id INTEGER NOT NULL,
        customer_paid_amount REAL NOT NULL,
        fuel_cost REAL NOT NULL,
        fuel_station_payout REAL NOT NULL,
        platform_fee REAL DEFAULT 0,
        collection_method VARCHAR(50) DEFAULT 'pending',
        payment_status VARCHAR(30) DEFAULT 'pending',
        collected_at TIMESTAMP,
        settled_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id) ON DELETE CASCADE,
        FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
      )
    `);
    console.log("Table cod_settlements created.");

    console.log("Creating audit_logs table...");
    await run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id ${idPrimaryKey()},
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        user_id INTEGER,
        user_role VARCHAR(50),
        old_values TEXT,
        new_values TEXT,
        ip_address VARCHAR(50),
        user_agent TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log("Table audit_logs created.");

    console.log("Adding fuel station columns to service_requests...");
    const srCols = [
      "fuel_station_id INTEGER",
      "fuel_price_per_litre REAL",
      "litres REAL",
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

    console.log("Creating indexes...");
    const indexes = [
      ["fuel_stations_user_id", "fuel_stations", "user_id"],
      ["fuel_stations_email", "fuel_stations", "email"],
      ["fuel_stations_verified", "fuel_stations", "is_verified"],
      ["fuel_station_stock_fuel_station", "fuel_station_stock", "fuel_station_id"],
      ["fuel_station_stock_fuel_type", "fuel_station_stock", "fuel_type"],
      ["fuel_station_ledger_fuel_station", "fuel_station_ledger", "fuel_station_id"],
      ["fuel_station_ledger_status", "fuel_station_ledger", "status"],
      ["fuel_station_ledger_created", "fuel_station_ledger", "created_at"],
      ["cod_settlements_fuel_station", "cod_settlements", "fuel_station_id"],
      ["cod_settlements_worker", "cod_settlements", "worker_id"],
      ["cod_settlements_status", "cod_settlements", "payment_status"],
      ["audit_logs_entity", "audit_logs", "entity_type"],
      ["audit_logs_user", "audit_logs", "user_id"],
      ["audit_logs_created", "audit_logs", "created_at"],
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
