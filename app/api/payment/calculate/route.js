import { NextResponse } from "next/server";
const { getDB, getLocalDateTimeString } = require("../../../../database/db");
const { calculateSettlement, validateSettlement } = require("../../../../database/settlement-calculator");

/**
 * POST /api/payment/calculate
 * Calculate settlement breakdown for a service request
 * Body: { service_request_id, litres, fuel_price_per_litre, distance_km, waiting_time_minutes, is_night_delivery, is_rainy_weather, is_emergency_request }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      service_request_id,
      litres = 1,
      fuel_price_per_litre = 100,
      distance_km = 0,
      waiting_time_minutes = 0,
      is_night_delivery = false,
      is_rainy_weather = false,
      is_emergency_request = false,
    } = body;

    if (!service_request_id) {
      return NextResponse.json(
        { error: "service_request_id is required" },
        { status: 400 }
      );
    }

    const db = getDB();

    // Get service request details
    const serviceRequest = await new Promise((resolve) => {
      db.get(
        "SELECT * FROM service_requests WHERE id = ?",
        [service_request_id],
        (err, row) => resolve(row || null)
      );
    });

    if (!serviceRequest) {
      return NextResponse.json(
        { error: "Service request not found" },
        { status: 404 }
      );
    }

    // Get worker configuration if assigned
    let workerConfig = {};
    if (serviceRequest.assigned_worker) {
      const worker = await new Promise((resolve) => {
        db.get(
          "SELECT base_pay_per_order, per_km_rate, surge_split_percentage, peak_hour_bonus_percentage, long_distance_bonus_km, long_distance_bonus, incentive_threshold_deliveries, incentive_bonus, minimum_guaranteed_pay FROM workers WHERE id = ?",
          [serviceRequest.assigned_worker],
          (err, row) => resolve(row || {})
        );
      });
      workerConfig = worker;
    }

    // Get platform configuration
    let platformConfig = {};
    const settings = await new Promise((resolve) => {
      db.get(
        "SELECT delivery_fee_base, platform_service_fee_percentage, surge_night_multiplier, surge_rain_multiplier, surge_emergency_multiplier FROM platform_settings WHERE id = 1",
        [],
        (err, row) => resolve(row || {})
      );
    });
    platformConfig = settings;

    // Calculate settlement
    const settlement = calculateSettlement({
      serviceRequestId: service_request_id,
      litres,
      fuelPricePerLitre: fuel_price_per_litre,
      deliveryFeeOverride: serviceRequest.delivery_fee_override,
      platformServiceFeeOverride: serviceRequest.platform_service_fee_override,
      surgeFeeOverride: serviceRequest.surge_fee_override,
      distanceKm: distance_km,
      waitingTimeMinutes: waiting_time_minutes,
      isNightDelivery: is_night_delivery,
      isRainyWeather: is_rainy_weather,
      isEmergencyRequest: is_emergency_request,
      workerConfig,
      platformConfig,
      workerDeliveriesCompleted: serviceRequest.completed_delivery_count || 0,
    });

    // Validate settlement
    const validation = validateSettlement(settlement);

    return NextResponse.json({
      success: true,
      settlement,
      validation,
      request_details: {
        service_request_id,
        litres,
        fuel_price_per_litre,
        distance_km,
        waiting_time_minutes,
        conditions: {
          night_delivery: is_night_delivery,
          rainy_weather: is_rainy_weather,
          emergency_request: is_emergency_request,
        },
      },
    });
  } catch (err) {
    console.error("Settlement calculation error:", err);
    return NextResponse.json(
      { error: "Failed to calculate settlement", details: err.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/payment/calculate?service_request_id=123
 * Get settlement for a specific service request (read-only)
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const service_request_id = url.searchParams.get("service_request_id");

    if (!service_request_id) {
      return NextResponse.json(
        { error: "service_request_id query parameter is required" },
        { status: 400 }
      );
    }

    const db = getDB();

    // Check if settlement already exists
    const existingSettlement = await new Promise((resolve) => {
      db.get(
        "SELECT * FROM settlements WHERE service_request_id = ?",
        [service_request_id],
        (err, row) => resolve(row || null)
      );
    });

    if (existingSettlement) {
      return NextResponse.json({
        success: true,
        settlement: existingSettlement,
        cached: true,
      });
    }

    return NextResponse.json(
      { error: "Settlement not found for this service request" },
      { status: 404 }
    );
  } catch (err) {
    console.error("Get settlement error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve settlement" },
      { status: 500 }
    );
  }
}
