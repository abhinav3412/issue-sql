import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../../database/db");
const bcrypt = require("bcryptjs");

const ACTIVITY_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type VARCHAR(50) NOT NULL,
    message VARCHAR(500) NOT NULL,
    entity_type VARCHAR(20),
    entity_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

export async function PATCH(request, context) {
  try {
    const params = await context.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    const body = await request.json();
    const { first_name, last_name, email, phone_number, role, new_password } = body || {};
    if (!first_name || !last_name || !email || !phone_number || role == null) {
      return NextResponse.json(
        { error: "Missing required fields: first_name, last_name, email, phone_number, role" },
        { status: 400 }
      );
    }
    const allowedRoles = ["User", "Admin"];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (id === 1 && role !== "Admin") {
      return NextResponse.json(
        { error: "Cannot change role of primary admin (ID 1)" },
        { status: 403 }
      );
    }
    const effectiveRole = id === 1 ? "Admin" : role;
    const db = getDB();

    const existing = await new Promise((resolve, reject) => {
      db.get(
        "SELECT first_name, last_name, email, phone_number, role FROM users WHERE id = ?",
        [id],
        (err, row) => (err ? reject(err) : resolve(row ?? null))
      );
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (new_password != null && String(new_password).trim() !== "") {
      const hashedPassword = await bcrypt.hash(String(new_password).trim(), 10);
      await new Promise((resolve, reject) => {
        db.run(
          "UPDATE users SET first_name = ?, last_name = ?, email = ?, phone_number = ?, role = ?, password = ?, updated_at = datetime('now') WHERE id = ?",
          [first_name, last_name, email, phone_number, effectiveRole, hashedPassword, id],
          function (err) {
            if (err) reject(err);
            else if (this.changes === 0) resolve(null);
            else resolve();
          }
        );
      });
    } else {
      await new Promise((resolve, reject) => {
        db.run(
          "UPDATE users SET first_name = ?, last_name = ?, email = ?, phone_number = ?, role = ?, updated_at = datetime('now') WHERE id = ?",
          [first_name, last_name, email, phone_number, effectiveRole, id],
          function (err) {
            if (err) reject(err);
            else if (this.changes === 0) resolve(null);
            else resolve();
          }
        );
      });
    }
    const changes = [];
    if (existing.first_name !== first_name || existing.last_name !== last_name) changes.push("name");
    if (existing.email !== email) changes.push("email");
    if (String(existing.phone_number || "") !== String(phone_number || "")) changes.push("phone");
    if (existing.role !== effectiveRole) changes.push("role");
    if (new_password != null && String(new_password).trim() !== "") changes.push("password");
    const changeSummary = changes.length ? ` (${changes.join(", ")})` : "";

    await new Promise((resolve, reject) => {
      db.run(ACTIVITY_LOG_TABLE, (err) => (err ? reject(err) : resolve()));
    });
    const message = `User ${first_name} ${last_name} updated${changeSummary}`;
    const createdAt = getLocalDateTimeString();
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO activity_log (type, message, entity_type, entity_id, created_at) VALUES (?, ?, 'user', ?, ?)",
        ["user_updated", message, id, createdAt],
        (err) => (err ? reject(err) : resolve())
      );
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err && err.message && err.message.includes("UNIQUE")) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    console.error("Admin user update error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(request, context) {
  try {
    const params = await context.params;
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    if (id === 1) {
      return NextResponse.json(
        { error: "Cannot delete the primary admin (ID 1)" },
        { status: 403 }
      );
    }
    const db = getDB();

    const user = await new Promise((resolve, reject) => {
      db.get("SELECT id, first_name, last_name FROM users WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row ?? null);
      });
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await new Promise((resolve, reject) => {
      db.run(ACTIVITY_LOG_TABLE, (err) => (err ? reject(err) : resolve()));
    });
    const message = `User ${user.first_name} ${user.last_name} removed`;
    const createdAt = getLocalDateTimeString();
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO activity_log (type, message, entity_type, entity_id, created_at) VALUES (?, ?, 'user', ?, ?)",
        ["user_deleted", message, id, createdAt],
        (err) => (err ? reject(err) : resolve())
      );
    });

    await new Promise((resolve, reject) => {
      db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Admin user delete error:", err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
