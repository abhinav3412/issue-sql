import { NextResponse } from "next/server";
const { getDB } = require("../../../database/db");

export async function POST(request) {
    try {
        const body = await request.json();
        const { request_id, rating, review_comment } = body;

        if (!request_id || !rating) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const db = getDB();

        // Ensure columns exist
        await new Promise((resolve) => {
            db.run("ALTER TABLE service_requests ADD COLUMN rating INTEGER", (err) => resolve());
        });
        await new Promise((resolve) => {
            db.run("ALTER TABLE service_requests ADD COLUMN review_comment TEXT", (err) => resolve());
        });
        // Ensure lock_reason column exists in workers (just in case)
        await new Promise((resolve) => {
            db.run("ALTER TABLE workers ADD COLUMN lock_reason TEXT", (err) => resolve());
        });

        // Update the request with rating
        await new Promise((resolve, reject) => {
            db.run(
                "UPDATE service_requests SET rating = ?, review_comment = ? WHERE id = ?",
                [rating, review_comment || "", request_id],
                (err) => (err ? reject(err) : resolve())
            );
        });

        // Get the assigned worker for this request
        const requestDetails = await new Promise((resolve, reject) => {
            db.get(
                "SELECT assigned_worker FROM service_requests WHERE id = ?",
                [request_id],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        if (requestDetails && requestDetails.assigned_worker) {
            const workerId = requestDetails.assigned_worker;

            // Check last 10 ratings
            const recentRatings = await new Promise((resolve, reject) => {
                db.all(
                    "SELECT rating FROM service_requests WHERE assigned_worker = ? AND status = 'Completed' AND rating IS NOT NULL ORDER BY completed_at DESC LIMIT 10",
                    [workerId],
                    (err, rows) => (err ? reject(err) : resolve(rows || []))
                );
            });

            if (recentRatings.length >= 10) {
                const sum = recentRatings.reduce((a, b) => a + (b.rating || 0), 0);
                const avg = sum / recentRatings.length;

                if (avg < 3) {
                    // Lock the worker
                    await new Promise((resolve, reject) => {
                        db.run(
                            "UPDATE workers SET status = 'Offline', status_locked = 1, lock_reason = 'Low Rating' WHERE id = ?",
                            [workerId],
                            (err) => (err ? reject(err) : resolve())
                        );
                    });
                    console.log(`Worker ${workerId} locked due to low rating: ${avg}`);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Feedback error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
