/**
 * Settlement Calculator - Calculates payment distribution between:
 * - Customer Final Bill
 * - Fuel Station Payout
 * - Worker Payment
 * - Platform Profit
 */

/**
 * Calculate customer bill and settlement breakdown
 * @param {Object} params
 * @returns {Object} settlement breakdown with all amounts
 */
function calculateSettlement(params) {
  const {
    serviceRequestId,
    serviceType,
    litres = 1,
    fuelPricePerLitre = 100,
    deliveryFeeOverride = null,
    platformServiceFeeOverride = null,
    surgeFeeOverride = null,
    distanceKm = 0,
    waitingTimeMinutes = 0,
    isNightDelivery = null, // Changed to null by default to allow auto-detection
    isRainyWeather = null,  // Changed to null by default
    isEmergencyRequest = false,
    workerConfig = {},
    platformConfig = {},
    workerDeliveriesCompleted = 0,
    orderTimestamp = new Date(),
  } = params;

  // Auto-detect Night Delivery if not provided
  let nightActive = isNightDelivery;
  if (nightActive === null) {
    const hour = orderTimestamp.getHours();
    // Default night hours: 9 PM - 6 AM
    nightActive = hour >= 21 || hour < 6;
  }

  // Detect Rainy Weather (Defaults to false if not provided, unless platformConfig says otherwise)
  let rainActive = isRainyWeather;
  if (rainActive === null) {
    rainActive = !!platformConfig.is_raining;
  }

  // Get configuration defaults
  const defPlatformConfig = {
    delivery_fee_base: 50,
    platform_service_fee_percentage: 5,
    surge_night_multiplier: 1.5,
    surge_rain_multiplier: 1.3,
    surge_emergency_multiplier: 2.0,
    platform_margin_target_percentage: 15,
  };
  const config = { ...defPlatformConfig, ...platformConfig };

  const defWorkerConfig = {
    base_pay_per_order: 50,
    per_km_rate: 10,
    surge_split_percentage: 50,
    peak_hour_bonus_percentage: 20,
    long_distance_bonus_km: 15,
    long_distance_bonus: 100,
    incentive_threshold_deliveries: 10,
    incentive_bonus: 200,
    minimum_guaranteed_pay: 100,
    cancellation_penalty: 50,
    late_penalty_per_minute: 2,
  };
  const worker = { ...defWorkerConfig, ...workerConfig };

  const isFuel = serviceType === 'petrol' || serviceType === 'diesel';

  // ===== STEP 1: CALCULATE CUSTOMER BILL =====
  const fuelCost = isFuel ? Math.round(litres * fuelPricePerLitre) : 0;

  // Initialize fees
  let deliveryFee = 0;
  let platformServiceFee = 0;
  let smallOrderSurcharge = 0;

  if (isFuel) {
    // Fuel Logic
    // 1. Base Delivery Fee starts at 80
    deliveryFee = deliveryFeeOverride !== null ? deliveryFeeOverride : 80;
    // 2. Small Order Surcharge
    smallOrderSurcharge = litres < 5 ? 35 : 0;
    // 3. Platform Fee (fixed 5% of fuel)
    platformServiceFee = platformServiceFeeOverride !== null ? platformServiceFeeOverride : Math.round(fuelCost * 0.05);
  } else {
    // Non-Fuel Logic (Mechanic/Crane)
    // The amount is primarily the Platform/Booking Fee
    deliveryFee = 0; // No delivery fee component for booking
    smallOrderSurcharge = 0;
    // Use override if provided, otherwise default base
    platformServiceFee = platformServiceFeeOverride !== null ? platformServiceFeeOverride : config.delivery_fee_base;
  }

  // 4. Surge Calculation
  let surgeFee = 0;
  let surgeReasons = [];

  if (nightActive) {
    surgeFee += Math.round(deliveryFee * 0.5);
    surgeReasons.push('Night delivery');
  }
  if (rainActive) {
    surgeFee += Math.round(deliveryFee * 0.3);
    surgeReasons.push('Rainy weather');
  }
  if (isEmergencyRequest) {
    // Keep emergency logic if needed, though frontend didn't use it explicitly in bill preview
    surgeFee += Math.round(deliveryFee * 0.5);
    surgeReasons.push('Emergency request');
  }

  // 5. Worker Estimate (We MUST cover this)
  let estimatedWorkerPayout = 0;
  if (isFuel) {
    // Logic: Max(100, 50 + 10 * 2 + 0.5 * surgeFee) -> 2km avg distance estimate
    estimatedWorkerPayout = Math.max(100, 50 + 20 + Math.round(surgeFee * 0.5));
  } else {
    // Non-fuel: Worker gets base pay (small portion) + surge share
    estimatedWorkerPayout = worker.base_pay_per_order + Math.round(surgeFee * (worker.surge_split_percentage / 100));
  }

  // 6. Protection: Adjust delivery fee if fees don't cover worker + platform profit (min 15)
  // Revenue = Delivery + Platform + Surge + SmallOrderSurcharge
  const currentServiceRevenue = deliveryFee + platformServiceFee + surgeFee + smallOrderSurcharge;
  const targetRevenue = estimatedWorkerPayout + 15; // Worker pay + Platform profit margin

  // Only apply dynamic pricing protection for fuel orders where delivery fee is flexible
  if (isFuel && currentServiceRevenue < targetRevenue) {
    deliveryFee += (targetRevenue - currentServiceRevenue);
  }

  // Total Customer Bill (Platform fee is part of revenue in this model)
  const customerTotal = fuelCost + deliveryFee + platformServiceFee + surgeFee + smallOrderSurcharge;

  // ===== STEP 2: FUEL STATION PAYOUT =====
  // Fuel station always gets 100% of fuel cost
  const fuelStationPayout = fuelCost;

  // ===== STEP 3: WORKER PAYMENT =====
  let workerPayout = 0;
  const basePay = worker.base_pay_per_order;
  let distancePay = 0;
  let workerSurgeBonus = 0;
  let waitingTimeBonus = 0;
  let incentiveBonus = 0;
  let longDistanceBonus = 0;
  let peakHourBonus = 0;
  let penalties = 0;
  let minimumGuaranteePay = 0;

  if (isFuel) {
    // Base pay
    workerPayout += basePay;

    // Distance-based payment
    distancePay = distanceKm * worker.per_km_rate;
    workerPayout += distancePay;

    // Surge bonus (worker gets a percentage of surge fee)
    workerSurgeBonus = Math.round(surgeFee * (worker.surge_split_percentage / 100));
    workerPayout += workerSurgeBonus;

    // Waiting time bonus (if applicable)
    waitingTimeBonus = Math.max(0, waitingTimeMinutes - 5) * worker.late_penalty_per_minute;
    workerPayout += waitingTimeBonus;

    // Incentive bonus (if completed deliveries meet threshold)
    if (workerDeliveriesCompleted > 0 && workerDeliveriesCompleted % worker.incentive_threshold_deliveries === 0) {
      incentiveBonus = worker.incentive_bonus;
      workerPayout += incentiveBonus;
    }

    // Long distance bonus
    if (distanceKm >= worker.long_distance_bonus_km) {
      longDistanceBonus = worker.long_distance_bonus;
      workerPayout += longDistanceBonus;
    }

    // Peak hour bonus (included in surge if applicable)
    if (nightActive || isEmergencyRequest) {
      peakHourBonus = Math.round((basePay + distancePay) * (worker.peak_hour_bonus_percentage / 100));
      if (peakHourBonus > 0 && surgeReasons.length === 0) {
        // Only add if not already counted in surge
        workerPayout += peakHourBonus;
      }
    }

    // Penalties
    workerPayout -= penalties;

    // Apply minimum guaranteed pay
    minimumGuaranteePay = worker.minimum_guaranteed_pay;
    if (workerPayout < minimumGuaranteePay) {
      workerPayout = minimumGuaranteePay;
    }
  } else {
    // Non-fuel logic (Mechanic/Crane)
    // Worker gets a small portion (base pay) + surge share
    workerPayout += basePay;
    
    workerSurgeBonus = Math.round(surgeFee * (worker.surge_split_percentage / 100));
    workerPayout += workerSurgeBonus;
    
    // No distance pay, waiting time, or minimum guarantee for booking fee settlement
  }

  // ===== STEP 4: PLATFORM PROFIT CALCULATION =====
  // Total fees collected from customer (Delivery + Service + Surge)
  const totalFees = deliveryFee + platformServiceFee + surgeFee;

  // In Swiggy-style logic, we don't cap the worker. 
  // We ensure the platform's profit is the remainder after paying the fuel station and the worker.
  const platformProfit = customerTotal - fuelStationPayout - workerPayout;

  // Validation: Alert if platform is at a loss (this should be prevented by dynamic fees on frontend)
  const platformMarginPercent = customerTotal > 0 ? (platformProfit / customerTotal) * 100 : 0;

  // ===== STEP 5: VALIDATION =====
  const platformMargin = platformProfit > 0 ? (platformProfit / customerTotal) * 100 : 0;
  const profitMarginValid = platformProfit > 0 && platformMargin >= 10;

  return {
    // Customer Bill
    customer: {
      fuel_cost: fuelCost,
      delivery_fee: deliveryFee,
      platform_service_fee: platformServiceFee,
      surge_fee: surgeFee,
      surge_reasons: surgeReasons,
      total: customerTotal,
    },

    // Payouts
    fuel_station: {
      payout: fuelStationPayout,
    },

    worker: {
      base_pay: basePay,
      distance_km: distanceKm,
      distance_pay: distancePay,
      surge_bonus: workerSurgeBonus,
      waiting_time_bonus: waitingTimeBonus,
      incentive_bonus: incentiveBonus,
      long_distance_bonus: longDistanceBonus,
      peak_hour_bonus: peakHourBonus,
      penalties: penalties,
      minimum_guarantee: Math.max(0, minimumGuaranteePay - (basePay + distancePay + workerSurgeBonus + waitingTimeBonus + incentiveBonus + longDistanceBonus)),
      total: workerPayout,
    },

    platform: {
      profit: platformProfit,
      margin_percentage: platformMargin.toFixed(2),
      margin_valid: profitMarginValid,
      message: profitMarginValid
        ? `Platform earns ${platformMargin.toFixed(2)}% margin`
        : `Warning: Platform margin ${platformMargin.toFixed(2)}% below 10% target`,
    },

    summary: {
      service_request_id: serviceRequestId,
      total_received: customerTotal,
      total_distributed: fuelStationPayout + workerPayout + platformProfit,
      calculation_time: new Date().toISOString(),
      is_balanced: Math.abs((fuelStationPayout + workerPayout + platformProfit) - customerTotal) < 1,
    },
  };
}

/**
 * Calculate worker payout for COD (Cash on Delivery) orders
 * Simpler calculation for COD where full amount goes to worker initially,
 * then admin collects and settles with platform/fuel station
 */
function calculateCODWorkerPayout(params) {
  const {
    orderAmount,
    basePay = 50,
    distanceKm = 0,
    perKmRate = 10,
    minimumGuarantee = 100,
  } = params;

  const distancePay = distanceKm * perKmRate;
  const totalPayout = Math.max(basePay + distancePay, minimumGuarantee);

  return {
    order_amount: orderAmount,
    worker_payout: totalPayout,
    settlement_pending: true,
    floater_balance: orderAmount - totalPayout,
  };
}

/**
 * Validate settlement is balanced (sum of payouts = customer total)
 */
function validateSettlement(settlement) {
  const received = settlement.summary.total_received;
  const distributed = settlement.summary.total_distributed;
  const difference = Math.abs(received - distributed);

  return {
    is_balanced: difference < 1,
    received: received,
    distributed: distributed,
    difference: difference,
  };
}

module.exports = {
  calculateSettlement,
  calculateCODWorkerPayout,
  validateSettlement,
};
