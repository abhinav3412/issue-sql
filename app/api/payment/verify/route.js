import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request) {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json();

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return NextResponse.json({ error: "Missing required signature fields" }, { status: 400 });
        }

        const secret = process.env.RAZORPAY_KEY_SECRET || "placeholder_secret";
        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature === razorpay_signature) {
            // In a production app, you might want to save this verified payment 
            // to the database as "verified" so the Create Request API can double-check it.
            return NextResponse.json({
                success: true,
                message: "Payment verified successfully",
                payment_id: razorpay_payment_id
            });
        } else {
            console.error("Signature mismatch. Check RAZORPAY_KEY_SECRET.");
            return NextResponse.json({ success: false, error: "Invalid payment signature" }, { status: 400 });
        }
    } catch (err) {
        console.error("Payment verification error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
