// Migration: Add fuel station stock tracking and COD support
// Run: node database/migrate-fuel-station-stock.js

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
    console.log("Creating fuel_station_stock table...");
    await run(`
      CREATE TABLE IF NOT EXISTS fuel_station_stock (
        id ${idPrimaryKey()},
        fuel_station_id INTEGER NOT NULL,
        fuel_type VARCHAR(50) NOT NULL,
        stock_litres REAL DEFAULT 1000,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id),
        UNIQUE(fuel_station_id, fuel_type)
      )
    `);
    console.log("Table fuel_station_stock ready.");

    console.log("Adding fuel station configuration columns...");
    const fuelStationCols = [
      "is_open INTEGER DEFAULT 1",
      "cod_supported INTEGER DEFAULT 1",
      "cod_balance_limit REAL DEFAULT 5000",
      "cod_current_balance REAL DEFAULT 0",
      "platform_trust_flag INTEGER DEFAULT 1",
      "max_queue_time_minutes INTEGER DEFAULT 30",
      "average_service_time_minutes INTEGER DEFAULT 5",
      "last_stock_update TIMESTAMP",
      "is_verified INTEGER DEFAULT 0",
    ];

    for (const col of fuelStationCols) {
      try {
        await run(`ALTER TABLE fuel_stations ADD COLUMN ${col}`);
        console.log(`  Added ${col.split(" ")[0]}`);
      } catch (err) {
        if (!isDuplicateColumnError(err)) {
          console.warn(`  ${col.split(" ")[0]}: ${err.message}`);
        }
      }
    }

    console.log("Creating worker_station_cache table...");
    await run(`
      CREATE TABLE IF NOT EXISTS worker_station_cache (
        id ${idPrimaryKey()},
        worker_id INTEGER NOT NULL,
        service_request_id INTEGER NOT NULL,
        fuel_station_id INTEGER NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        worker_lat REAL,
        worker_lng REAL,
        distance_km REAL,
        is_valid INTEGER DEFAULT 1,
        invalidated_at TIMESTAMP,
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (service_request_id) REFERENCES service_requests(id),
        FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id)
      )
    `);
    console.log("Table worker_station_cache ready.");

    console.log("Creating fuel_station_assignments table...");
    await run(`
      CREATE TABLE IF NOT EXISTS fuel_station_assignments (
        id ${idPrimaryKey()},
        service_request_id INTEGER NOT NULL,
        worker_id INTEGER NOT NULL,
        fuel_station_id INTEGER NOT NULL,
        fuel_type VARCHAR(50) NOT NULL,
        litres REAL NOT NULL,
        distance_km REAL NOT NULL,
        is_cod INTEGER DEFAULT 0,
        supports_cod INTEGER DEFAULT 0,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        picked_up_at TIMESTAMP,
        status VARCHAR(30) DEFAULT 'assigned',
        rejection_reason VARCHAR(200),
        reassignment_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_request_id) REFERENCES service_requests(id),
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id)
      )
    `);
    console.log("Table fuel_station_assignments ready.");

    console.log("Creating indexes...");
    const indexes = [
      ["fuel_station_stock_station", "fuel_station_stock", "fuel_station_id"],
      ["fuel_station_stock_type", "fuel_station_stock", "fuel_type"],
      ["worker_station_cache_worker", "worker_station_cache", "worker_id"],
      ["worker_station_cache_request", "worker_station_cache", "service_request_id"],
      ["worker_station_cache_valid", "worker_station_cache", "is_valid"],
      ["fuel_assignments_request", "fuel_station_assignments", "service_request_id"],
      ["fuel_assignments_worker", "fuel_station_assignments", "worker_id"],
      ["fuel_assignments_station", "fuel_station_assignments", "fuel_station_id"],
      ["fuel_assignments_status", "fuel_station_assignments", "status"],
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
