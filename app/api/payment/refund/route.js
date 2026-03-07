import { NextResponse } from "next/server";
import Razorpay from "razorpay";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder_secret",
});

export async function POST(request) {
    try {
        const body = await request.json();
        const { payment_id, amount, reason } = body;

        if (!payment_id) {
            return NextResponse.json({ error: "Payment ID is required" }, { status: 400 });
        }

        const refundAmount = amount ? Math.round(Number(amount) * 100) : undefined; // Amount in paise if provided

        const refund = await razorpay.payments.refund(payment_id, {
            amount: refundAmount,
            notes: {
                reason: reason || "User requested cancellation",
            },
        });

        const db = getDB();
        const now = getLocalDateTimeString();

        // Log refund in payment table
        await new Promise((resolve) => {
            db.run(
                `UPDATE payments SET status = 'reversed', updated_at = ? WHERE provider_payment_id = ?`,
                [now, payment_id],
                (err) => resolve()
            );
        });

        // Also update service request if needed (though usually handled by status change)
        await new Promise((resolve) => {
            db.run(
                `UPDATE service_requests SET payment_status = 'REFUNDED' WHERE payment_id = ?`,
                [payment_id],
                (err) => resolve()
            );
        });

        return NextResponse.json({
            success: true,
            refund_id: refund.id,
            amount: refund.amount,
            status: refund.status
        });
    } catch (err) {
        console.error("Razorpay refund error:", err);
        return NextResponse.json({ error: err.error?.description || "Refund failed" }, { status: 500 });
    }
}
