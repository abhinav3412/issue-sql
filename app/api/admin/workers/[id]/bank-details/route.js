import { NextResponse } from "next/server";
const { getDB } = require("../../../../../../database/db");
const { requireAdmin, errorResponse, successResponse } = require("../../../../../../database/auth-middleware");
const { decrypt } = require("../../../../../utils/encryption");

export async function GET(request, props) {
    const params = await props.params;
    const { id } = params;

    const auth = requireAdmin(request);
    if (!auth) return errorResponse("Unauthorized", 401);

    const db = getDB();
    try {
        const bankDetails = await new Promise((resolve, reject) => {
            db.get(
                "SELECT * FROM worker_bank_details WHERE worker_id = ?",
                [id],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        if (!bankDetails) {
            return errorResponse("Bank details not found", 404);
        }

        // Decrypt sensitive data for admin
        return successResponse({
            bank_details: {
                ...bankDetails,
                account_number: decrypt(bankDetails.account_number),
                ifsc_code: decrypt(bankDetails.ifsc_code),
            }
        });
    } catch (err) {
        console.error("Admin GET bank-details error:", err);
        return errorResponse("Internal server error", 500);
    }
}

export async function PATCH(request, props) {
    const params = await props.params;
    const { id } = params;

    const auth = requireAdmin(request);
    if (!auth) return errorResponse("Unauthorized", 401);

    try {
        const { status, rejection_reason } = await request.json();

        if (![0, 1, 2].includes(status)) {
            return errorResponse("Invalid status", 400);
        }

        const db = getDB();
        await new Promise((resolve, reject) => {
            db.run(
                "UPDATE worker_bank_details SET is_bank_verified = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE worker_id = ?",
                [status, rejection_reason || null, id],
                (err) => (err ? reject(err) : resolve())
            );
        });

        return successResponse({ message: "Verification status updated" });
    } catch (err) {
        console.error("Admin PATCH bank-status error:", err);
        return errorResponse("Internal server error", 500);
    }
}
