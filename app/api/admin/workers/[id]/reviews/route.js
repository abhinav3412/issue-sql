import { NextResponse } from "next/server";
const { getDB } = require("../../../../../../database/db");

export async function GET(request, { params }) {
    try {
        const { id } = await params;
        if (!id) return NextResponse.json({ error: "Missing worker ID" }, { status: 400 });

        const db = getDB();
        const reviews = await new Promise((resolve, reject) => {
            db.all(
                "SELECT id, rating, review_comment, completed_at FROM service_requests WHERE assigned_worker = ? AND rating IS NOT NULL ORDER BY completed_at DESC",
                [id],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        return NextResponse.json(reviews);
    } catch (err) {
        console.error("Fetch reviews error:", err);
        return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
    }
}
