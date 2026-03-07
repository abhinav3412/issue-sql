import { NextResponse } from "next/server";
const { getDB, getUTCDateTimeString } = require("../../../database/db");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

function ensurePasswordResetsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        account_type VARCHAR(20) DEFAULT 'users',
        account_id INTEGER,
        token VARCHAR(128) NOT NULL,
        used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        consumed_at DATETIME
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function addColumnIfMissing(db, columnSql) {
  return new Promise((resolve) => {
    db.run(`ALTER TABLE password_resets ADD COLUMN ${columnSql}`, (err) => {
      if (err && !/duplicate column|already exists/i.test(String(err.message || ""))) {
        console.error(`Failed adding column ${columnSql}:`, err);
      }
      resolve();
    });
  });
}

async function ensurePasswordResetsColumns(db) {
  await addColumnIfMissing(db, "account_type VARCHAR(20) DEFAULT 'users'");
  await addColumnIfMissing(db, "account_id INTEGER");
  await addColumnIfMissing(db, "consumed_at DATETIME");
}

async function ensurePasswordResetsCompatibility(db) {
  // Legacy Postgres schemas may still enforce users-only semantics.
  // Best-effort relaxations so worker reset tokens can be stored too.
  await new Promise((resolve) => {
    db.run(
      "ALTER TABLE password_resets DROP CONSTRAINT IF EXISTS password_resets_user_id_fkey",
      () => resolve()
    );
  });
  await new Promise((resolve) => {
    db.run(
      "ALTER TABLE password_resets ALTER COLUMN user_id DROP NOT NULL",
      () => resolve()
    );
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = body?.email && String(body.email).trim();
    const requestedRole = body?.role && String(body.role).trim();
    if (!email || !requestedRole) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 });
    }
    const normalizedRole = requestedRole.toLowerCase();
    const isWorkerRole = normalizedRole === "worker";
    const isUserRole =
      normalizedRole === "user" ||
      normalizedRole === "admin" ||
      normalizedRole === "station" ||
      normalizedRole === "fuel_station";
    if (!isWorkerRole && !isUserRole) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const db = getDB();
    await ensurePasswordResetsTable(db);
    await ensurePasswordResetsColumns(db);
    await ensurePasswordResetsCompatibility(db);

    const accountType = isWorkerRole ? "workers" : "users";
    const querySql = isWorkerRole
      ? "SELECT id, email FROM workers WHERE email = ?"
      : "SELECT id, email FROM users WHERE email = ?";
    const account = await new Promise((resolve, reject) => {
      db.get(querySql, [email], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });

    // Always return success to avoid user enumeration
    if (account) {
      const token = crypto.randomBytes(24).toString("hex");
      const createdAt = getUTCDateTimeString();
      const userIdForLegacyFk = accountType === "users" ? account.id : null;
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO password_resets (user_id, account_type, account_id, token, created_at) VALUES (?, ?, ?, ?, ?)",
          [userIdForLegacyFk, accountType, account.id, token, createdAt],
          (err) => (err ? reject(err) : resolve())
        );
      });

      // Send email with reset link if SMTP configured
      const appUrl = process.env.APP_URL || request.nextUrl?.origin || "http://localhost:3000";
      const resetLink = `${appUrl}/reset-password/${token}`;

      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpHost && smtpPort && smtpUser && smtpPass) {
        try {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
            // For Gmail or other servers that might require it
            tls: {
              rejectUnauthorized: false
            }
          });

          const mail = {
            from: process.env.SMTP_FROM || smtpUser,
            to: account.email,
            subject: "AGF Password Reset",
            text: `You requested a password reset for your AGF account. Please use the following link to reset your password:\n\n${resetLink}\n\nThis link will expire in 24 hours.\n\nIf you didn't request this, you can safely ignore this email.`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p>You requested a password reset for your AGF account. Click the button below to set a new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
                </div>
                <p>If the button doesn't work, copy and paste this link into your browser:</p>
                <p><a href="${resetLink}">${resetLink}</a></p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #777;">This link will expire in 24 hours. If you didn't request this, please ignore this email.</p>
              </div>
            `,
          };

          await transporter.sendMail(mail);
          console.log(`[forgot-password] SENT reset email to ${account.email} using real SMTP`);
        } catch (err) {
          console.error("CRITICAL: Failed to send reset email using real SMTP:", err);
          // Don't fall back to Ethereal if real SMTP was provided but failed
        }
      } else {
        // Only use Ethereal if NO real SMTP configuration exists
        try {
          console.log("[forgot-password] No real SMTP configured, generating Ethereal test account...");
          const testAccount = await nodemailer.createTestAccount();
          const transporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass,
            },
          });

          const mail = {
            from: process.env.SMTP_FROM || testAccount.user,
            to: account.email,
            subject: "AGF Password Reset (Test)",
            text: `(TEST ENV) Reset link: ${resetLink}`,
            html: `<p>(TEST ENV) Click here to reset: <a href="${resetLink}">${resetLink}</a></p>`,
          };

          const info = await transporter.sendMail(mail);
          const preview = nodemailer.getTestMessageUrl(info);
          console.log(`[forgot-password] Ethereal preview URL: ${preview}`);
          console.log(`[forgot-password] Reset link for ${account.email}: ${resetLink}`);
        } catch (err) {
          console.warn(`[forgot-password] Failed to use Ethereal, reset link for ${account.email} is:`, resetLink);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
