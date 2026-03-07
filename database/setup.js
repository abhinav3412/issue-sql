// Database Setup Script
// Run this to initialize your database: npm run setup

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

async function setup() {
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id ${idPrimaryKey()},
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        driving_licence VARCHAR(100),
        role VARCHAR(20) DEFAULT 'User' CHECK(role IN ('User', 'Admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS workers (
        id ${idPrimaryKey()},
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Busy', 'Offline')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS connectivity_reports (
        id ${idPrimaryKey()},
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        severity VARCHAR(20) NOT NULL,
        effective_type VARCHAR(50),
        downlink REAL,
        rtt INTEGER,
        failures INTEGER DEFAULT 0,
        offline INTEGER DEFAULT 0,
        reported_at TIMESTAMP NOT NULL
      )
    `);

    await run("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
    await run("CREATE INDEX IF NOT EXISTS idx_workers_email ON workers(email)");
    await run("CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status)");
    await run("CREATE INDEX IF NOT EXISTS idx_connectivity_reports_time ON connectivity_reports(reported_at)");
    await run("CREATE INDEX IF NOT EXISTS idx_connectivity_reports_latlng ON connectivity_reports(lat, lng)");

    console.log(`Database setup complete using ${db.type}.`);
  } catch (err) {
    console.error("Database setup failed:", err.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

setup();
