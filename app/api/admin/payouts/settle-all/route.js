import { NextResponse } from "next/server";
const { getDB } = require("../../../../../database/db");
const { requireAdmin, errorResponse, successResponse } = require("../../../../../database/auth-middleware");
const { createRazorpayContact, createRazorpayFundAccount, createRazorpayPayout } = require("../../../../utils/razorpayX");
const { decrypt } = require("../../../../utils/encryption");

function normalizeAccountNumber(value) {
    return String(value || "").replace(/\s+/g, "");
}

function normalizeIfsc(value) {
    return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function isValidIfsc(value) {
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value);
}

export async function POST(request) {
    const auth = requireAdmin(request);
    if (!auth) return errorResponse("Unauthorized", 401);

    const db = getDB();
    try {
        await new Promise((resolve) => {
            db.run(`CREATE TABLE IF NOT EXISTS worker_payouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                reference_id VARCHAR(100),
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (worker_id) REFERENCES workers(id)
            )`, () => resolve());
        });

        // 1. Fetch eligible workers
        const eligibleWorkers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT w.id, w.first_name, w.last_name, w.email, w.phone_number, w.pending_balance, 
                bd.account_holder_name, bd.account_number, bd.ifsc_code, bd.bank_name,
                bd.razorpay_contact_id, bd.razorpay_fund_account_id
         FROM workers w
         JOIN worker_bank_details bd ON w.id = bd.worker_id
         WHERE w.pending_balance > 0 AND bd.is_bank_verified = 1`,
                [],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });

        if (eligibleWorkers.length === 0) {
            return errorResponse("No verified workers found with pending balance.", 400);
        }

        const results = {
            total_workers: eligibleWorkers.length,
            success_count: 0,
            failed_count: 0,
            total_amount: 0,
            details: []
        };

        for (const worker of eligibleWorkers) {
            try {
                let contact_id = worker.razorpay_contact_id;
                let fund_account_id = worker.razorpay_fund_account_id;

                // Step A: Create Contact if missing
                if (!contact_id) {
                    const contact = await createRazorpayContact({
                        name: `${worker.first_name} ${worker.last_name}`,
                        email: worker.email,
                        contact: worker.phone_number
                    });
                    contact_id = contact.id;
                    await new Promise((resolve) => {
                        db.run("UPDATE worker_bank_details SET razorpay_contact_id = ? WHERE worker_id = ?", [contact_id, worker.id], () => resolve());
                    });
                }

                // Step B: Create Fund Account if missing
                if (!fund_account_id) {
                    const rawIfsc = decrypt(worker.ifsc_code);
                    const rawAccountNumber = decrypt(worker.account_number);
                    const normalizedIfsc = normalizeIfsc(rawIfsc);
                    const normalizedAccountNumber = normalizeAccountNumber(rawAccountNumber);

                    if (!isValidIfsc(normalizedIfsc)) {
                        await new Promise((resolve) => {
                            db.run(
                                `UPDATE worker_bank_details
                                 SET is_bank_verified = 2,
                                     rejection_reason = ?,
                                     updated_at = CURRENT_TIMESTAMP
                                 WHERE worker_id = ?`,
                                ["Invalid IFSC format. Must be 11 characters (e.g., HDFC0001234).", worker.id],
                                () => resolve()
                            );
                        });
                        throw new Error(`Invalid IFSC for worker ${worker.id}. Please correct bank details and re-verify.`);
                    }

                    if (!/^\d{9,18}$/.test(normalizedAccountNumber)) {
                        await new Promise((resolve) => {
                            db.run(
                                `UPDATE worker_bank_details
                                 SET is_bank_verified = 2,
                                     rejection_reason = ?,
                                     updated_at = CURRENT_TIMESTAMP
                                 WHERE worker_id = ?`,
                                ["Invalid account number. Must be 9 to 18 digits.", worker.id],
                                () => resolve()
                            );
                        });
                        throw new Error(`Invalid account number for worker ${worker.id}. Please correct bank details and re-verify.`);
                    }

                    const fundAccount = await createRazorpayFundAccount(contact_id, {
                        name: worker.account_holder_name,
                        ifsc: normalizedIfsc,
                        account_number: normalizedAccountNumber
                    });
                    fund_account_id = fundAccount.id;
                    await new Promise((resolve) => {
                        db.run("UPDATE worker_bank_details SET razorpay_fund_account_id = ? WHERE worker_id = ?", [fund_account_id, worker.id], () => resolve());
                    });
                }

                // Step C: Trigger Payout
                const payout = await createRazorpayPayout({
                    fund_account_id,
                    amount: worker.pending_balance,
                    reference_id: `SETTLE_${worker.id}_${Date.now()}`
                });

                // Step D: Log Payout and update worker status
                await new Promise((resolve) => {
                    db.serialize(() => {
                        db.run(
                            "INSERT INTO payout_logs (worker_id, payout_id, amount, status) VALUES (?, ?, ?, ?)",
                            [worker.id, payout.id, worker.pending_balance, payout.status || 'processing']
                        );
                        db.run(
                            "INSERT INTO worker_payouts (worker_id, amount, reference_id, notes, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                            [worker.id, worker.pending_balance, payout.id, "Admin payout settlement"]
                        );
                        // Move balance to processing (subtract it for now, handle rejection in webhook)
                        db.run("UPDATE workers SET pending_balance = 0, last_payout_at = CURRENT_TIMESTAMP WHERE id = ?", [worker.id]);
                    });
                    resolve();
                });

                results.success_count++;
                results.total_amount += worker.pending_balance;
                results.details.push({ worker_id: worker.id, name: worker.first_name, status: 'success', payout_id: payout.id });

            } catch (err) {
                console.error(`Payout failed for worker ${worker.id}:`, err);
                results.failed_count++;
                results.details.push({ worker_id: worker.id, name: worker.first_name, status: 'failed', error: err.message });
            }
        }

        return successResponse(results);
    } catch (err) {
        console.error("Bulk payout error:", err);
        return errorResponse("Internal server error during payout processing", 500);
    }
}
