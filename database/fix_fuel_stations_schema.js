const { getDB } = require("./db");

const db = getDB();

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

function isDuplicateColumnError(err) {
  return /(duplicate column name|already exists|ER_DUP_FIELDNAME|42701)/i.test(String(err?.message || ""));
}

async function fixSchema() {
  try {
    console.log("Checking fuel_stations schema...");

    try {
      await run("ALTER TABLE fuel_stations ADD COLUMN user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE");
      console.log("Added user_id column");
    } catch (err) {
      if (isDuplicateColumnError(err)) {
        console.log("user_id already exists");
      } else {
        console.error("Error adding user_id:", err.message);
      }
    }

    const cols = [
      "station_name VARCHAR(255)",
      "email VARCHAR(255) UNIQUE",
      "phone_number VARCHAR(20)",
      "address TEXT",
      "latitude REAL",
      "longitude REAL",
      "cod_enabled INTEGER DEFAULT 1",
      "cod_current_balance REAL DEFAULT 0",
      "cod_balance_limit REAL DEFAULT 50000",
      "is_verified INTEGER DEFAULT 0",
      "is_open INTEGER DEFAULT 1",
      "platform_trust_flag INTEGER DEFAULT 0",
      "total_earnings REAL DEFAULT 0",
      "pending_payout REAL DEFAULT 0",
      "last_stock_update TIMESTAMP",
    ];

    for (const colDef of cols) {
      const colName = colDef.split(" ")[0];
      try {
        await run(`ALTER TABLE fuel_stations ADD COLUMN ${colDef}`);
        console.log(`Added ${colName}`);
      } catch (err) {
        if (!isDuplicateColumnError(err)) {
          console.error(`Error adding ${colName}:`, err.message);
        }
      }
    }

    await run("CREATE INDEX IF NOT EXISTS idx_fuel_stations_user_id ON fuel_stations(user_id)");
    console.log("Index idx_fuel_stations_user_id checked/created");
    console.log("Fix complete.");
  } catch (err) {
    console.error("Fix error:", err.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

fixSchema();
