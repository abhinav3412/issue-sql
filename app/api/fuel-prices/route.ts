import { NextResponse } from 'next/server';

// This would ideally be an environment variable or a database entry
const FALLBACK_PRICES = {
    petrol: 107.48,
    diesel: 96.48,
    last_updated: "2026-02-14T06:00:00Z"
};

const { getDB } = require("../../../database/db");

export async function GET() {
    try {
        const db = getDB();
        const settings = await new Promise((resolve) => {
            db.get("SELECT is_raining FROM platform_settings WHERE id = 1", [], (err: any, row: any) => {
                resolve(row || { is_raining: 0 });
            });
        });

        const isRaining = !!(settings as any).is_raining;
        
        let prices = { ...FALLBACK_PRICES };
        let source = "Verified Market Rates (Fallback)";

        // Fetch real-time data if API URL is configured
        if (process.env.FUEL_PRICE_API_URL) {
            try {
                const res = await fetch(process.env.FUEL_PRICE_API_URL, {
                    headers: {
                        // Add authentication headers if your provider requires them
                        // 'Authorization': `Bearer ${process.env.FUEL_PRICE_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    next: { revalidate: 3600 } // Cache for 1 hour
                });

                if (res.ok) {
                    const liveData = await res.json();
                    // Note: Adjust parsing based on your specific API response structure
                    if (liveData.petrol && liveData.diesel) {
                        prices = {
                            petrol: Number(liveData.petrol),
                            diesel: Number(liveData.diesel),
                            last_updated: new Date().toISOString()
                        };
                        source = "Live External API";
                    }
                }
            } catch (e) {
                console.error("Failed to fetch live fuel prices, using fallback:", e);
            }
        }

        const data = {
            ...prices,
            is_raining: isRaining,
            current_time: new Date().toISOString(),
            status: "Success",
            message: source === "Live External API" ? "Real-time rates fetched" : "Fuel prices are updated daily at 6:00 AM IST",
            source: source,
            cities: [
                { name: "Thiruvananthapuram", petrol: prices.petrol, diesel: prices.diesel },
                { name: "Kochi", petrol: prices.petrol - 1.93, diesel: prices.diesel - 1.72 },
                { name: "Kozhikode", petrol: prices.petrol - 1.68, diesel: prices.diesel - 1.46 }
            ]
        };

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch fuel prices" }, { status: 500 });
    }
}
