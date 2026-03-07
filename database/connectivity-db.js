const { getDB } = require("./db");

let initPromise = null;
let initialized = false;

function getConnectivityDB() {
  return getDB();
}

function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function idPrimaryKey(db) {
  if (db.type === "postgres") return "BIGSERIAL PRIMARY KEY";
  if (db.type === "mysql") return "BIGINT PRIMARY KEY AUTO_INCREMENT";
  return "INTEGER PRIMARY KEY AUTOINCREMENT";
}

async function ensureConnectivitySchema() {
  if (initialized) return;
  if (initPromise) return initPromise;

  const db = getConnectivityDB();
  initPromise = (async () => {
    await runAsync(
      db,
      `
      CREATE TABLE IF NOT EXISTS connectivity_reports (
        id ${idPrimaryKey(db)},
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
      `
    );
    await runAsync(db, "CREATE INDEX IF NOT EXISTS idx_connectivity_reports_time ON connectivity_reports(reported_at)");
    await runAsync(db, "CREATE INDEX IF NOT EXISTS idx_connectivity_reports_latlng ON connectivity_reports(lat, lng)");
    initialized = true;
  })();

  return initPromise;
}

module.exports = {
  getConnectivityDB,
  ensureConnectivitySchema,
};
