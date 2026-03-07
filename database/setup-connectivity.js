// Run: node database/setup-connectivity.js

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

async function setupConnectivity() {
  try {
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
    await run("CREATE INDEX IF NOT EXISTS idx_connectivity_reports_time ON connectivity_reports(reported_at)");
    await run("CREATE INDEX IF NOT EXISTS idx_connectivity_reports_latlng ON connectivity_reports(lat, lng)");
    console.log(`Connectivity tables ready on ${db.type}.`);
  } catch (err) {
    console.error("Error creating connectivity tables:", err.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

setupConnectivity();
