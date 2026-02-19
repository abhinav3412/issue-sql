// Seed default admin user into the database.
// Run from project root: node database/seed-admin.js
// Admin login: admin@gmail.com / admin123

const bcrypt = require("bcryptjs");
const { getDB } = require("./db");

const db = getDB();

const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "admin123";
const HASH_ROUNDS = 10;

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

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

async function seedAdmin() {
  try {
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, HASH_ROUNDS);
    const existing = await get("SELECT id FROM users WHERE email = ?", [ADMIN_EMAIL]);

    if (existing) {
      await run(
        "UPDATE users SET password = ?, first_name = 'Admin', last_name = 'User', role = 'Admin', updated_at = CURRENT_TIMESTAMP WHERE email = ?",
        [hashedPassword, ADMIN_EMAIL]
      );
      console.log("Admin user updated: admin@gmail.com / admin123");
    } else {
      await run(
        "INSERT INTO users (email, password, first_name, last_name, phone_number, role) VALUES (?, ?, 'Admin', 'User', '+919000000000', 'Admin')",
        [ADMIN_EMAIL, hashedPassword]
      );
      console.log("Admin user created: admin@gmail.com / admin123");
    }
  } catch (err) {
    console.error("Error seeding admin:", err.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

seedAdmin();
