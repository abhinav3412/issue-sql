// Migration: Add service_types and service_requests tables to existing database.
// Run: node database/migrate-service-requests.js

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

function ignoreInsertClause(conflictColumn) {
  if (isPostgres) return `ON CONFLICT (${conflictColumn}) DO NOTHING`;
  if (isMySQL) return `ON DUPLICATE KEY UPDATE ${conflictColumn} = ${conflictColumn}`;
  return "ON CONFLICT DO NOTHING";
}

async function migrate() {
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS service_types (
        id ${idPrimaryKey()},
        code VARCHAR(50) UNIQUE NOT NULL,
        label VARCHAR(100) NOT NULL,
        amount INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Table service_types ready.");

    const types = [
      ["petrol", "Petrol", 100],
      ["diesel", "Diesel", 150],
      ["crane", "Crane", 200],
      ["mechanic_bike", "Mechanic (Bike)", 300],
      ["mechanic_car", "Mechanic (Car)", 300],
    ];
    for (const [code, label, amount] of types) {
      await run(
        `INSERT INTO service_types (code, label, amount) VALUES (?, ?, ?) ${ignoreInsertClause("code")}`,
        [code, label, amount]
      );
    }
    console.log("Service types seeded (5 rows).");

    await run(`
      CREATE TABLE IF NOT EXISTS service_requests (
        id ${idPrimaryKey()},
        user_id INTEGER,
        vehicle_number VARCHAR(50) NOT NULL,
        driving_licence VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        service_type VARCHAR(50) NOT NULL,
        amount INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending' CHECK(status IN ('Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    console.log("Table service_requests ready.");

    await run("CREATE INDEX IF NOT EXISTS idx_service_types_code ON service_types(code)");
    await run("CREATE INDEX IF NOT EXISTS idx_service_requests_user_id ON service_requests(user_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status)");
    await run("CREATE INDEX IF NOT EXISTS idx_service_requests_created_at ON service_requests(created_at)");
    console.log("Indexes created.");

    console.log("Migration complete. service_types and service_requests are in the database.");
  } catch (err) {
    console.error("Migration error:", err.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

migrate();
