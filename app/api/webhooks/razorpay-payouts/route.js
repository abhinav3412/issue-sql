import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");
const crypto = require('crypto');

export async function POST(request) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'payout_webhook_secret_placeholder';
    const signature = request.headers.get('x-razorpay-signature');
    const body = await request.text();

    // Verify signature (Standard Razorpay Webhook Verification)
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    // Skip signature verification for testing if secret is not set correctly
    if (process.env.NODE_ENV === 'production' && signature !== expectedSignature) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payload = JSON.parse(body);
    const { event, payload: eventData } = payload;
    const payout = eventData.payout.entity;

    const db = getDB();

    try {
        if (event === 'payout.processed') {
            // Success! Update log
            await new Promise((resolve) => {
                db.run(
                    "UPDATE payout_logs SET status = 'processed', updated_at = CURRENT_TIMESTAMP WHERE payout_id = ?",
                    [payout.id],
                    () => resolve()
                );
            });
        } else if (event === 'payout.reversed' || event === 'payout.rejected' || event === 'payout.failed') {
            // Failure! Revert worker balance
            const log = await new Promise((resolve) => {
                db.get("SELECT worker_id, amount FROM payout_logs WHERE payout_id = ?", [payout.id], (err, row) => resolve(row));
            });

            if (log) {
                await new Promise((resolve) => {
                    db.serialize(() => {
                        // Add back the amount to pending_balance
                        db.run("UPDATE workers SET pending_balance = pending_balance + ? WHERE id = ?", [log.amount, log.worker_id]);
                        // Update log
                        db.run(
                            "UPDATE payout_logs SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE payout_id = ?",
                            [event.split('.')[1], payout.failure_reason || 'Payout failed', payout.id]
                        );
                    });
                    resolve();
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Webhook processing error:", err);
        return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
    }
}
