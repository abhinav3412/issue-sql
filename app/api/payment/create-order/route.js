import { NextResponse } from "next/server";
import Razorpay from "razorpay";
const { getDB } = require("../../../../database/db");
const { calculateSettlement } = require("../../../../database/settlement-calculator");

// Use env variables or fallback for demo
const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder_secret",
});

export async function POST(request) {
    try {
        const body = await request.json();
        const { service_type, litres, user_id, fuel_price, amount } = body;

        if (!service_type) {
            return NextResponse.json({ error: "Service type is required" }, { status: 400 });
        }

        const db = getDB();
        const platformSettings = await new Promise((resolve) => {
            db.get("SELECT is_raining FROM platform_settings WHERE id = 1", [], (err, row) => {
                resolve(row || { is_raining: 0 });
            });
        });

        const isFuel = service_type === 'petrol' || service_type === 'diesel';
        const fuelPrice = isFuel ? Number(fuel_price) : 0;

        if (isFuel && (!fuelPrice || fuelPrice <= 0)) {
            return NextResponse.json({ error: "Live fuel price is required" }, { status: 400 });
        }

        // Recalculate bill securely
        const settlement = calculateSettlement({
            serviceType: service_type,
            litres: litres || 1,
            fuelPricePerLitre: fuelPrice,
            platformConfig: { is_raining: !!platformSettings.is_raining },
            orderTimestamp: new Date(),
            platformServiceFeeOverride: !isFuel && amount ? Number(amount) : null
        });

        const totalAmountInPaise = Math.round(settlement.customer.total * 100);

        const options = {
            amount: totalAmountInPaise,
            currency: "INR",
            receipt: `receipt_${Date.now()}`,
            notes: {
                user_id: user_id || "anonymous",
                service_type: service_type,
                litres: litres || 0,
            },
        };

        const order = await razorpay.orders.create(options);

        return NextResponse.json({
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            settlement_preview: settlement.customer,
            key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder"
        });
    } catch (err) {
        console.error("Razorpay order creation error:", err);
        return NextResponse.json({ error: "Failed to create order. Check Razorpay keys." }, { status: 500 });
    }
}
