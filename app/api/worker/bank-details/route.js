import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");
const { requireWorker, errorResponse, successResponse } = require("../../../../database/auth-middleware");
const { encrypt, maskValue } = require("../../../utils/encryption");

/** GET worker bank details (masked) */
export async function GET(request) {
    const auth = requireWorker(request);
    if (!auth) return errorResponse("Unauthorized", 401);

    const db = getDB();
    try {
        const bankDetails = await new Promise((resolve, reject) => {
            db.get(
                "SELECT account_holder_name, account_number, ifsc_code, bank_name, is_bank_verified, rejection_reason FROM worker_bank_details WHERE worker_id = ?",
                [auth.id],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        if (!bankDetails) {
            return successResponse({ bank_details: null });
        }

        // Mask the sensitive details even for the worker themselves
        // They can edit, but once submitted, we hide the full number for security.
        return successResponse({
            bank_details: {
                ...bankDetails,
                account_number: maskValue(bankDetails.account_number, 4),
                ifsc_code: maskValue(bankDetails.ifsc_code, 4),
            }
        });
    } catch (err) {
        console.error("GET bank-details error:", err);
        return errorResponse("Internal server error", 500);
    }
}

/** POST/Update worker bank details */
export async function POST(request) {
    const auth = requireWorker(request);
    if (!auth) return errorResponse("Unauthorized", 401);

    try {
        const { account_holder_name, account_number, ifsc_code, bank_name } = await request.json();

        if (!account_holder_name || !account_number || !ifsc_code || !bank_name) {
            return errorResponse("All bank details are required", 400);
        }

        const normalizedAccountHolderName = String(account_holder_name).trim();
        const normalizedBankName = String(bank_name).trim();
        const normalizedAccountNumber = String(account_number).replace(/\s+/g, "");
        const normalizedIfsc = String(ifsc_code).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

        if (!/^\d{9,18}$/.test(normalizedAccountNumber)) {
            return errorResponse("Account number must be 9 to 18 digits", 400);
        }

        // Standard IFSC format: 4 letters + 0 + 6 alphanumeric characters.
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalizedIfsc)) {
            return errorResponse("Invalid IFSC format. Expected 11 characters (e.g., HDFC0001234)", 400);
        }

        // Encrypt sensitive data
        const encryptedAccount = encrypt(normalizedAccountNumber);
        const encryptedIFSC = encrypt(normalizedIfsc);

        const db = getDB();

        // Check if worker already has bank details
        const existing = await new Promise((resolve) => {
            db.get("SELECT id, is_bank_verified FROM worker_bank_details WHERE worker_id = ?", [auth.id], (err, row) => resolve(row));
        });

        if (existing && existing.is_bank_verified === 1) {
            return errorResponse("Bank details are already verified and cannot be changed. Contact support to update.", 403);
        }

        await new Promise((resolve, reject) => {
            if (existing) {
                db.run(
                    `UPDATE worker_bank_details 
           SET account_holder_name = ?, account_number = ?, ifsc_code = ?, bank_name = ?, is_bank_verified = 0, rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE worker_id = ?`,
                    [normalizedAccountHolderName, encryptedAccount, encryptedIFSC, normalizedBankName, auth.id],
                    (err) => (err ? reject(err) : resolve())
                );
            } else {
                db.run(
                    `INSERT INTO worker_bank_details (worker_id, account_holder_name, account_number, ifsc_code, bank_name)
           VALUES (?, ?, ?, ?, ?)`,
                    [auth.id, normalizedAccountHolderName, encryptedAccount, encryptedIFSC, normalizedBankName],
                    (err) => (err ? reject(err) : resolve())
                );
            }
        });

        return successResponse({ message: "Bank details submitted for verification" });
    } catch (err) {
        console.error("POST bank-details error:", err);
        return errorResponse("Internal server error", 500);
    }
}
