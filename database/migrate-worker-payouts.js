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
    console.log("Starting Worker Payouts & Bank Verification Migration...");

    await run(`
      CREATE TABLE IF NOT EXISTS worker_bank_details (
        id ${idPrimaryKey()},
        worker_id INTEGER NOT NULL UNIQUE,
        account_holder_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        ifsc_code TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        is_bank_verified INTEGER DEFAULT 0,
        razorpay_contact_id TEXT,
        razorpay_fund_account_id TEXT,
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
      )
    `);
    console.log("Table worker_bank_details ensured.");

    await run(`
      CREATE TABLE IF NOT EXISTS payout_logs (
        id ${idPrimaryKey()},
        worker_id INTEGER NOT NULL,
        payout_id TEXT UNIQUE,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'processing',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (worker_id) REFERENCES workers(id)
      )
    `);
    console.log("Table payout_logs ensured.");

    try {
      await run("ALTER TABLE workers ADD COLUMN pending_balance REAL DEFAULT 0.0");
      console.log("Column pending_balance added to workers.");
    } catch (err) {
      if (isDuplicateColumnError(err)) {
        console.log("Column pending_balance already exists.");
      } else {
        console.error("Error adding pending_balance column:", err.message);
      }
    }

    try {
      await run("ALTER TABLE workers ADD COLUMN last_payout_at TIMESTAMP");
    } catch (err) {
      if (!isDuplicateColumnError(err)) {
        console.error("Error adding last_payout_at column:", err.message);
      }
    }

    console.log("Migration finished.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

migrate();
