﻿"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotification } from "@/app/NotificationSystem";
import BackgroundPaths from "../BackgroundPaths";
import SpotlightCard from "../SpotlightCard";

const UserMap = dynamic(() => import("./UserMap"), { ssr: false });
const RequestLocationPicker = dynamic(() => import("./RequestLocationPicker"), { ssr: false });

type Worker = {
  id: number;
  first_name: string;
  last_name: string;
  status: string;
  service_type?: string | null;
  phone_number?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type ServiceRequest = {
  id: number;
  user_id: number | null;
  vehicle_number: string;
  driving_licence: string;
  phone_number: string;
  service_type: string;
  amount: number;
  status: string;
  created_at: string;
  assigned_worker?: number | null;
  user_lat?: number | null;
  user_lon?: number | null;
  rating?: number;
  review_comment?: string;
  payment_details?: string | null;
  payment_status?: string | null;
};

type CodEligibility = {
  allowed: boolean;
  reason?: string;
  stationId?: number;
};

type BillPreview = {
  fuel_cost: number;
  delivery_fee: number;
  platform_service_fee: number;
  surge_fee: number;
  surge_reasons: string[];
  total: number;
  worker_payout: number;
  fuel_station_payout: number;
};

const ACTIVE_STATUSES = ["Pending", "Assigned", "In Progress"];
const HISTORY_STATUSES = ["Completed", "Cancelled"];



const SERVICE_OPTIONS = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "crane", label: "Crane" },
  { value: "mechanic_bike", label: "Mechanic (Bike)" },
  { value: "mechanic_car", label: "Mechanic (Car)" },
] as const;

export default function UserDashboardPage() {
  const { showToast } = useNotification();
  const [user, setUser] = useState<{
    first_name: string;
    id?: number;
    phone_number?: string;
    driving_licence?: string;
  } | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [summaryTab, setSummaryTab] = useState<"Overview" | "Active Requests" | "History">("Overview");
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    vehicle_number: "",
    driving_licence: "",
    phone_number: "",
    service_type: "",
  });
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "COD">("ONLINE");
  const [onlinePaymentStatus, setOnlinePaymentStatus] = useState<"idle" | "pending" | "success" | "failed">("idle");
  const [onlinePaymentId, setOnlinePaymentId] = useState<string | null>(null);
  const [codEligibility, setCodEligibility] = useState<CodEligibility | null>(null);
  const [checkingCod, setCheckingCod] = useState(false);
  const [requestLocation, setRequestLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [requestLocationError, setRequestLocationError] = useState<string | null>(null);
  const [manualLocationMode, setManualLocationMode] = useState(false);
  const [lastKnownLocation, setLastKnownLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [serviceRequestsLoading, setServiceRequestsLoading] = useState(false);
  const [assignedWorker, setAssignedWorker] = useState<Worker | null>(null);
  const [cancelNow, setCancelNow] = useState(Date.now());

  const [ratingRequest, setRatingRequest] = useState<ServiceRequest | null>(null);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [cancelConfRequest, setCancelConfRequest] = useState<ServiceRequest | null>(null);
  const [viewingBillReq, setViewingBillReq] = useState<ServiceRequest | null>(null);
  const [billPreview, setBillPreview] = useState<BillPreview | null>(null);
  const [fuelLitres, setFuelLitres] = useState(5);
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({ petrol: 100, diesel: 95 });
  const [serviceSettings, setServiceSettings] = useState<Record<string, number>>({
    crane: 1500,
    mechanic_bike: 500,
    mechanic_car: 1200,
  });
  const [fuelMetadata, setFuelMetadata] = useState<{
    message: string;
    last_updated: string;
    cities: { name: string; petrol: number; diesel: number }[];
  } | null>(null);
  const [isCurrentlyRaining, setIsCurrentlyRaining] = useState(false);

  const ONLINE_PAYMENT_STORAGE_KEY = "agf_online_payment_status";

  // Disable form inputs if payment is in progress or completed to prevent data mismatch
  const isFormDisabled = requestSubmitting || onlinePaymentStatus === "pending" || onlinePaymentStatus === "success";

  // Load Razorpay Script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Restore payment status from session storage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ONLINE_PAYMENT_STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored.status === "success") {
          setOnlinePaymentStatus("success");
          setOnlinePaymentId(stored.paymentId || null);
        }
      }
    } catch (_) { }
  }, []);

  useEffect(() => {
    fetch("/api/fuel-prices")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.petrol && data.diesel) {
          if (data.is_raining !== undefined) {
            setIsCurrentlyRaining(!!data.is_raining);
          }
          setFuelPrices({ petrol: data.petrol, diesel: data.diesel });
          setFuelMetadata({
            message: data.message,
            last_updated: data.last_updated,
            cities: data.cities || []
          });
        }
      })
      .catch(() => { });

    // Fetch service settings (dynamic amounts set by admin)
    fetch("/api/admin/service-prices")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapping: Record<string, number> = {};
          data.forEach((p: any) => {
            mapping[p.service_type] = p.amount;
          });
          setServiceSettings(mapping);
        }
      })
      .catch(() => { });
  }, []);

  const fetchServiceRequests = useCallback(async () => {
    setServiceRequestsLoading(true);
    try {
      const url =
        user?.id != null && !Number.isNaN(Number(user.id))
          ? `/api/service-requests?user_id=${user.id}`
          : "/api/service-requests";
      const res = await fetch(url);
      const data = res.ok ? await res.json() : [];
      setServiceRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setServiceRequests([]);
    } finally {
      setServiceRequestsLoading(false);
    }
  }, [user?.id]);

  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("agf_user") : null;
      if (raw) {
        const data = JSON.parse(raw);
        if (data.role !== "User" && data.role !== "Admin") {
          router.push("/login");
          return;
        }
        setUser({
          first_name: data.first_name || "User",
          id: data.id != null ? Number(data.id) : undefined,
          phone_number: data.phone_number || "",
          driving_licence: data.driving_licence || "",
        });
      } else {
        router.push("/login");
        return;
      }
    } catch (_) {
      router.push("/login");
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("agf_user");
    sessionStorage.removeItem(ONLINE_PAYMENT_STORAGE_KEY);
    router.push("/login");
  };

  const openRequestModal = () => {
    let storedStatus: { status?: string; paymentId?: string | null } | null = null;
    try {
      const raw = sessionStorage.getItem(ONLINE_PAYMENT_STORAGE_KEY);
      storedStatus = raw ? JSON.parse(raw) : null;
    } catch (_) { }
    setRequestModalOpen(true);
    setRequestForm({
      vehicle_number: "",
      driving_licence: user?.driving_licence ?? "",
      phone_number: user?.phone_number ?? "",
      service_type: "",
    });
    setRequestErrors({});
    setRequestSuccess(null);
    setPaymentMethod("ONLINE");
    if (storedStatus?.status) {
      setOnlinePaymentStatus(storedStatus.status as "success" | "failed");
      setOnlinePaymentId(storedStatus.paymentId || null);
    } else if (onlinePaymentStatus !== "success" && onlinePaymentStatus !== "failed") {
      setOnlinePaymentStatus("idle");
      setOnlinePaymentId(null);
    }
    setCodEligibility(null);
    setCheckingCod(false);
    setRequestLocation(gpsLocation);
    setRequestLocationError(null);
    setManualLocationMode(false);
  };

  const closeRequestModal = () => {
    setRequestModalOpen(false);
    setRequestSubmitting(false);
  };

  const handleRazorpayPayment = async () => {
    if (!billPreview) {
      showToast("Please select service and amount first", "error");
      return;
    }

    setOnlinePaymentStatus("pending");

    try {
      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_type: requestForm.service_type,
          litres: fuelLitres,
          user_id: user?.id,
          fuel_price: fuelPrices[requestForm.service_type],
          amount: billPreview.total
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order creation failed");

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "AGF – Roadside Fuel",
        description: `${requestForm.service_type.toUpperCase()} - ${fuelLitres}L Delivery`,
        order_id: data.order_id,
        handler: async function (response: any) {
          // Verify signature on backend
          const verifyRes = await fetch("/api/payment/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            }),
          });

          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            setOnlinePaymentStatus("success");
            setOnlinePaymentId(response.razorpay_payment_id);
            sessionStorage.setItem(ONLINE_PAYMENT_STORAGE_KEY, JSON.stringify({
              status: "success",
              paymentId: response.razorpay_payment_id
            }));
            showToast("Payment verified! Creating request...", "success");

            // Auto-submit request
            await submitRequest(undefined, response.razorpay_payment_id, data.amount / 100);
          } else {
            setOnlinePaymentStatus("failed");
            showToast("Payment verification failed.", "error");
          }
        },
        prefill: {
          name: user?.first_name || "",
          contact: user?.phone_number || ""
        },
        theme: { color: "#2563eb" },
        modal: {
          ondismiss: function () {
            setOnlinePaymentStatus("idle");
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error(err);
      setOnlinePaymentStatus("failed");
      showToast(err.message || "Failed to start payment", "error");
    }
  };
  useEffect(() => {
    if (!requestModalOpen) return;
    if (typeof window === "undefined") return;
    if (requestLocation || gpsLocation) return;
    if (!navigator.geolocation) {
      setRequestLocation(null);
      setRequestLocationError("Location is not supported by your browser.");
      setManualLocationMode(true);
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setRequestLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setRequestLocationError(null);
        setManualLocationMode(false);
      },
      () => {
        if (cancelled) return;
        setRequestLocation(null);
        setRequestLocationError("Unable to access your location.");
        setManualLocationMode(true);
      },
      { timeout: 8000 }
    );
    return () => {
      cancelled = true;
    };
  }, [requestModalOpen, requestLocation, gpsLocation]);

  useEffect(() => {
    if (requestLocation) {
      setLastKnownLocation(requestLocation);
    }
  }, [requestLocation]);

  const getServiceAmount = (type: string | null) => {
    if (!type) return 0;
    if (type === 'petrol' || type === 'diesel') return 0; // Handled separately
    return serviceSettings[type] || 0;
  };

  useEffect(() => {
    if (!requestModalOpen) return;
    if (!gpsLocation) return;
    if (requestLocation) return;
    setRequestLocation(gpsLocation);
    setRequestLocationError(null);
    setManualLocationMode(false);
  }, [gpsLocation, requestModalOpen, requestLocation]);

  useEffect(() => {
    if (!requestModalOpen) return;
    if (!requestForm.service_type) {
      setCodEligibility(null);
      return;
    }
    if (!user?.id || Number.isNaN(Number(user.id))) {
      setCodEligibility({ allowed: false, reason: "invalid_user" });
      setPaymentMethod("ONLINE");
      return;
    }
    if (!requestLocation) {
      setCodEligibility(null);
      return;
    }
    let amount: number = getServiceAmount(requestForm.service_type);

    // For fuel, we need the calculated amount from the preview
    if ((requestForm.service_type === 'petrol' || requestForm.service_type === 'diesel') && billPreview) {
      amount = billPreview.total;
    }

    if (!amount && !(requestForm.service_type === 'petrol' || requestForm.service_type === 'diesel')) {
      setCodEligibility(null);
      return;
    }
    let cancelled = false;
    setCheckingCod(true);
    const locationParam = `${requestLocation.lat},${requestLocation.lon}`;
    fetch(`/api/payment/eligibility?user_id=${user.id}&order_amount=${amount}&location=${encodeURIComponent(locationParam)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        if (data?.cod_allowed) {
          setCodEligibility({ allowed: true, stationId: data.fuel_station_id });
        } else {
          setCodEligibility({ allowed: false, reason: data?.reason || "cod_unavailable" });
          setPaymentMethod("ONLINE");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCodEligibility({ allowed: false, reason: "server_error" });
          setPaymentMethod("ONLINE");
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingCod(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestModalOpen, requestForm.service_type, requestLocation, user?.id, billPreview]);

  const validateRequestForm = (): boolean => {
    const err: Record<string, string> = {};
    if (!requestForm.vehicle_number.trim()) err.vehicle_number = "Vehicle number is required";
    if (!requestForm.driving_licence.trim()) err.driving_licence = "Driving licence is required";
    if (!requestForm.phone_number.trim()) err.phone_number = "Phone number is required";
    if (!requestForm.service_type) err.service_type = "Service type is required";
    setRequestErrors(err);
    return Object.keys(err).length === 0;
  };

  // Calculate bill preview when service type changes
  useEffect(() => {
    if (!requestModalOpen || !requestForm.service_type) {
      setBillPreview(null);
      return;
    }

    const isFuel = requestForm.service_type === 'petrol' || requestForm.service_type === 'diesel';

    if (isFuel) {
      const pricePerLitre = fuelPrices[requestForm.service_type] || 100;
      const now = new Date();
      const hour = now.getHours();
      const isNight = hour >= 21 || hour < 6;

      // Swiggy-style logic: Dynamic fees to protect margin without cutting worker pay
      const fuelCost = Math.round(fuelLitres * pricePerLitre);

      // 1. Base Delivery Fee starts at 80
      let deliveryFee = 80;

      // 2. Small Order Surcharge (Swiggy logic): 
      // If order is small (e.g. < 5L), add a convenience fee to ensure we cover the worker's minimum guarantee
      const smallOrderSurcharge = fuelLitres < 5 ? 35 : 0;

      // 3. Platform Fee (fixed 5% of fuel)
      const platformFee = Math.round(fuelCost * 0.05);

      // 4. Surge Calculation
      let surgeFee = 0;
      const surgeReasons: string[] = [];
      if (isNight) {
        surgeFee += Math.round(deliveryFee * 0.5);
        surgeReasons.push('Night delivery');
      }
      if (isCurrentlyRaining) {
        surgeFee += Math.round(deliveryFee * 0.3);
        surgeReasons.push('Rainy weather');
      }

      // 5. Worker Estimate (We MUST cover this)
      const estimatedWorkerPayout = Math.max(100, 50 + 10 * 2 + Math.round(surgeFee * 0.5)); // 2km avg distance estimate

      // 6. Protection: Adjust delivery fee if fees don't cover worker + platform profit (min 15)
      const currentServiceRevenue = deliveryFee + platformFee + surgeFee + smallOrderSurcharge;
      const targetRevenue = estimatedWorkerPayout + 15; // Worker pay + Platform profit margin

      if (currentServiceRevenue < targetRevenue) {
        deliveryFee += (targetRevenue - currentServiceRevenue);
      }

      const total = fuelCost + deliveryFee + platformFee + surgeFee + smallOrderSurcharge;

      setBillPreview({
        fuel_cost: fuelCost,
        delivery_fee: deliveryFee + smallOrderSurcharge, // Combine for display
        platform_service_fee: platformFee,
        surge_fee: surgeFee,
        surge_reasons: surgeReasons,
        total,
        worker_payout: estimatedWorkerPayout,
        fuel_station_payout: fuelCost,
      });
    } else {
      // For Crane, Mechanic Bike, Mechanic Car
      const baseFee = getServiceAmount(requestForm.service_type);
      
      let surgeFee = 0;
      const surgeReasons: string[] = [];
      
      const now = new Date();
      const hour = now.getHours();
      const isNight = hour >= 21 || hour < 6;
      
      if (isNight) {
        surgeFee += Math.round(baseFee * 0.5);
        surgeReasons.push('Night delivery');
      }
      if (isCurrentlyRaining) {
        surgeFee += Math.round(baseFee * 0.3);
        surgeReasons.push('Rainy weather');
      }
      
      const total = baseFee + surgeFee;

      setBillPreview({
        fuel_cost: 0,
        delivery_fee: 0,
        platform_service_fee: baseFee,
        surge_fee: surgeFee,
        surge_reasons: surgeReasons,
        total: total,
        worker_payout: 50 + Math.round(surgeFee * 0.5), // Base + Surge Share
        fuel_station_payout: 0,
      });
    }
  }, [requestModalOpen, requestForm.service_type, fuelLitres, fuelPrices, serviceSettings, isCurrentlyRaining]);

  async function submitRequest(e?: React.FormEvent, paymentIdOverride?: string, amountOverride?: number) {
    if (e) e.preventDefault();
    if (!validateRequestForm() || requestSubmitting) return;
    setRequestSubmitting(true);
    setRequestErrors({});

    const currentPaymentId = paymentIdOverride || onlinePaymentId;
    const currentPaymentStatus = paymentIdOverride ? "success" : onlinePaymentStatus;

    if (paymentMethod === "ONLINE" && currentPaymentStatus !== "success") {
      const message =
        currentPaymentStatus === "failed"
          ? "Online payment failed or was cancelled. Please switch to Cash on Delivery."
          : "Please complete the Razorpay payment before creating the request.";
      setRequestErrors({ submit: message });
      setRequestSubmitting(false);
      return;
    }

    if (paymentMethod === "COD" && !codEligibility?.allowed) {
      setRequestErrors({ submit: "COD is not available for this request." });
      setRequestSubmitting(false);
      return;
    }

    let user_lat: number | null = requestLocation?.lat ?? null;
    let user_lon: number | null = requestLocation?.lon ?? null;

    if (user_lat == null || user_lon == null) {
      try {
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 5000 });
        });
        if (pos) {
          user_lat = pos.coords.latitude;
          user_lon = pos.coords.longitude;
          setRequestLocation({ lat: user_lat, lon: user_lon });
          setRequestLocationError(null);
          setManualLocationMode(false);
          setLastKnownLocation({ lat: user_lat, lon: user_lon });
        }
      } catch (_) { }
    }

    if (user_lat == null || user_lon == null) {
      setRequestErrors({ submit: "Location is required. Please allow location access or pick a point on the map." });
      setRequestSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.id ?? null,
          vehicle_number: requestForm.vehicle_number.trim(),
          driving_licence: requestForm.driving_licence.trim(),
          phone_number: requestForm.phone_number.trim(),
          service_type: requestForm.service_type,
          user_lat,
          user_lon,
          payment_method: paymentMethod,
          fuel_station_id: codEligibility?.stationId ?? null,
          payment_id: currentPaymentId,
          amount: amountOverride !== undefined ? amountOverride : (billPreview?.total || 0),
          payment_details: billPreview ? JSON.stringify(billPreview) : null,
          litres: (requestForm.service_type === 'petrol' || requestForm.service_type === 'diesel') ? fuelLitres : null,
          fuel_price: (requestForm.service_type === 'petrol' || requestForm.service_type === 'diesel') ? fuelPrices[requestForm.service_type] : null
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRequestErrors({ submit: data.error || "Failed to create request" });
        return;
      }
      const option = SERVICE_OPTIONS.find((o) => o.value === requestForm.service_type);
      setRequestSuccess(
        `Request created successfully. Amount to pay: ₹${data.amount}.`
      );
      try {
        sessionStorage.removeItem(ONLINE_PAYMENT_STORAGE_KEY);
      } catch (_) { }
      setOnlinePaymentStatus("idle");
      setOnlinePaymentId(null);
      const licenceValue = requestForm.driving_licence.trim();
      if (licenceValue && user) {
        setUser((prev) => (prev ? { ...prev, driving_licence: licenceValue } : prev));
        try {
          const raw = localStorage.getItem("agf_user");
          const stored = raw ? JSON.parse(raw) : {};
          localStorage.setItem(
            "agf_user",
            JSON.stringify({ ...stored, driving_licence: licenceValue })
          );
        } catch (_) { }
      }
      setRequestForm({ vehicle_number: "", driving_licence: "", phone_number: "", service_type: "" });
      fetchServiceRequests();
      setTimeout(() => {
        closeRequestModal();
      }, 2000);
    } catch {
      setRequestErrors({ submit: "Network error. Please try again." });
    } finally {
      setRequestSubmitting(false);
    }
  };

  useEffect(() => {
    if (authChecked) fetchServiceRequests();
  }, [fetchServiceRequests, authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const interval = setInterval(() => {
      fetchServiceRequests();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchServiceRequests, authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    fetch("/api/workers")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setWorkers(Array.isArray(data) ? data : []))
      .catch(() => setWorkers([]))
      .finally(() => setWorkersLoading(false));
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const interval = setInterval(() => {
      fetchServiceRequests();
      fetch("/api/workers")
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setWorkers(Array.isArray(data) ? data : []))
        .catch(() => setWorkers([]));
    }, 60000);
    return () => clearInterval(interval);
  }, [authChecked, fetchServiceRequests]);

  useEffect(() => {
    if (!authChecked) return;
    const tick = setInterval(() => {
      setCancelNow(Date.now());
    }, 1000);
    return () => clearInterval(tick);
  }, [authChecked]);

  const activeAssignedRequest = serviceRequests.find(
    (req) => req.assigned_worker && (req.status === "Assigned" || req.status === "In Progress")
  );

  useEffect(() => {
    if (!activeAssignedRequest?.assigned_worker) {
      setAssignedWorker(null);
      return;
    }

    let cancelled = false;
    const fetchAssignedWorker = () => {
      fetch(`/api/workers?id=${activeAssignedRequest.assigned_worker}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled) setAssignedWorker(data && !data.error ? data : null);
        })
        .catch(() => {
          if (!cancelled) setAssignedWorker(null);
        });
    };

    fetchAssignedWorker();
    const interval = setInterval(fetchAssignedWorker, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeAssignedRequest?.assigned_worker]);

  const distanceKm = useCallback(
    (aLat?: number | null, aLon?: number | null, bLat?: number | null, bLon?: number | null) => {
      if (aLat == null || aLon == null || bLat == null || bLon == null) {
        return null;
      }
      const toRad = (value: number) => (value * Math.PI) / 180;
      const dLat = toRad(bLat - aLat);
      const dLon = toRad(bLon - aLon);
      const lat1 = toRad(aLat);
      const lat2 = toRad(bLat);
      const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const meters = 2 * 6371000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      return meters / 1000;
    },
    []
  );

  const handleUserPositionChange = useCallback(
    (pos: { lat: number; lng: number }) => {
      const next = { lat: pos.lat, lon: pos.lng };
      setGpsLocation(next);
      if (requestModalOpen && !requestLocation) {
        setRequestLocation(next);
        setRequestLocationError(null);
        setManualLocationMode(false);
      }
    },
    [requestModalOpen, requestLocation]
  );
  const codReasonLabel = (reason?: string) => {
    switch (reason) {
      case "trust_score_low":
        return "Trust score too low";
      case "location_not_supported":
        return "Location not eligible for COD";
      case "fuel_station_not_found":
        return "No nearby fuel station";
      case "fuel_station_no_cod":
        return "Fuel station does not support COD";
      case "order_amount_too_high":
        return "Order amount exceeds COD limit";
      case "cod_disabled":
        return "COD disabled for your account";
      case "cod_disabled_until":
        return "COD temporarily disabled";
      case "cod_fail_limit":
        return "Too many failed COD orders";
      case "invalid_user":
        return "User not eligible";
      case "server_error":
        return "Unable to check COD";
      default:
        return "COD not available";
    }
  };

  const openNearestFuelStation = async () => {
    let userLat = gpsLocation?.lat;
    let userLon = gpsLocation?.lon;

    if (userLat == null || userLon == null) {
      if (typeof window === "undefined" || !navigator.geolocation) {
        showToast("Location is not supported by your browser.", "error");
        return;
      }

      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000 });
      });

      if (!pos) {
        showToast("Unable to access your location. Please allow location access.", "error");
        return;
      }
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
    }

    const res = await fetch("/api/fuel-stations");
    const stations = res.ok ? await res.json() : [];
    if (!Array.isArray(stations) || stations.length === 0) {
      showToast("No fuel stations available.", "warning");
      return;
    }
    let nearest: any = null;
    let nearestDist = Infinity;

    for (const s of stations) {
      const d = distanceKm(userLat, userLon, s.latitude, s.longitude);
      if (d != null && d < nearestDist) {
        nearestDist = d;
        nearest = s;
      }
    }

    if (!nearest) {
      showToast("No fuel stations with valid location found.", "warning");
      return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLon}&destination=${nearest.latitude},${nearest.longitude}`;
    window.open(url, "_blank");
  };

  const getCancelMsLeft = (req: ServiceRequest) => {
    const created = new Date(req.created_at);
    if (Number.isNaN(created.getTime())) return 0;
    const elapsed = cancelNow - created.getTime();
    return Math.max(0, 60000 - elapsed);
  };

  const formatCancelTimer = (ms: number) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const mins = Math.floor(total / 60);
    const secs = String(total % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const handleUserCancelRequest = async (id: number) => {
    try {
      const res = await fetch(`/api/service-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Cancelled" }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data?.error || "Failed to cancel request", "error");
        return;
      }
      showToast("Request cancelled successfully.", "success");
      fetchServiceRequests();
    } catch {
      showToast("Network error. Please try again.", "error");
    }
  };

  const openRatingModal = (req: ServiceRequest) => {
    setRatingRequest(req);
    setRatingScore(0);
    setRatingComment("");
  };

  const closeRatingModal = () => {
    setRatingRequest(null);
    setRatingScore(0);
    setRatingComment("");
    setRatingSubmitting(false);
  };

  const handleRatingSubmit = async () => {
    if (!ratingRequest || ratingScore === 0) return;
    setRatingSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: ratingRequest.id,
          rating: ratingScore,
          review_comment: ratingComment,
        }),
      });
      if (res.ok) {
        fetchServiceRequests();
        closeRatingModal();
        showToast("Rating submitted successfully!", "success");
      } else {
        showToast("Failed to submit rating.", "error");
      }
    } catch {
      showToast("Network error.", "error");
    } finally {
      setRatingSubmitting(false);
    }
  };

  const assignedDistanceKm = distanceKm(
    activeAssignedRequest?.user_lat,
    activeAssignedRequest?.user_lon,
    assignedWorker?.latitude,
    assignedWorker?.longitude
  );
  const etaMinutes =
    assignedDistanceKm != null ? Math.max(1, Math.round((assignedDistanceKm / 30) * 60)) : null;

  if (!authChecked) return null;

  const firstName = user?.first_name || "User";
  const pickerCenter = lastKnownLocation ?? gpsLocation;

  return (
    <div className="user-dashboard">
      <div className="user-main-container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
        <div className="premium-breadcrumb">
          <span className="back-link">
            Home
          </span>
          <span>/ dashboard</span>
        </div>

        <section className="user-welcome-section" style={{ position: 'relative' }}>
          <BackgroundPaths />
          <button
            onClick={handleLogout}
            className="premium-logout-btn"
            style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10 }}
          >
            Logout
          </button>
          <div className="user-welcome-logo">AGF</div>
          <h1 className="user-welcome-title">Welcome back, {firstName}!</h1>
          <p className="user-welcome-subtitle">
            Manage your service requests and track assistance in real-time.
          </p>
        </section>

        {/* Live Tracking */}
        <section className="user-section user-map-section">
          <div className="user-section-header">
            <div>
              <h2 className="user-section-title">Live Tracking</h2>
              <p className="user-section-subtitle">Track your service workers in real-time.</p>
            </div>
            <div className="user-map-controls">
              <span className="user-live-pill">
                <span className="user-live-dot" /> Live Updates
              </span>
            </div>
          </div>
          <div className="user-map-layout">
            <div className="user-map-container">
              <UserMap assignedWorker={assignedWorker} onUserPositionChange={handleUserPositionChange} />
              <div className="user-map-legend">
                <span><span className="user-legend-dot user-legend-workers" /> Workers</span>
                <span><span className="user-legend-dot user-legend-you" /> Your Location</span>
              </div>
            </div>
            <div className="user-workers-panel">
              {activeAssignedRequest && assignedWorker && (
                <div className="user-assigned-worker-card">
                  <div className="user-assigned-worker-title">Assigned Worker</div>
                  <div className="user-assigned-worker-row">
                    <span className="user-assigned-worker-label">Name</span>
                    <span className="user-assigned-worker-value">
                      {assignedWorker.first_name} {assignedWorker.last_name}
                    </span>
                  </div>
                  <div className="user-assigned-worker-row">
                    <span className="user-assigned-worker-label">Phone</span>
                    <a className="user-assigned-worker-phone" href={`tel:${assignedWorker.phone_number || ""}`}>
                      {assignedWorker.phone_number || "N/A"}
                    </a>
                  </div>
                  <div className="user-assigned-worker-row">
                    <span className="user-assigned-worker-label">Distance</span>
                    <span className="user-assigned-worker-value">
                      {assignedDistanceKm != null ? `${assignedDistanceKm.toFixed(2)} km` : "Calculating..."}
                    </span>
                  </div>
                  <div className="user-assigned-worker-row">
                    <span className="user-assigned-worker-label">ETA</span>
                    <span className="user-assigned-worker-value">
                      {etaMinutes != null ? `${etaMinutes} min` : "Calculating..."}
                    </span>
                  </div>
                </div>
              )}
              <h3>Active Workers ({workers.length})</h3>
              {workersLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="skeleton" style={{ width: '80%' }}></div>
                  <div className="skeleton" style={{ width: '60%' }}></div>
                  <div className="skeleton" style={{ width: '70%' }}></div>
                </div>
              ) : workers.length === 0 ? (
                <p className="user-workers-empty">No active workers nearby</p>
              ) : (
                <ul className="user-workers-list">
                  {workers.map((w) => (
                    <li key={w.id} className="user-worker-item">
                      <span className="user-worker-dot" />
                      <div>
                        <span className="user-worker-name">
                          {w.first_name} {w.last_name} · <span className="user-worker-role">{w.service_type || "General"}</span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Action Cards */}
        <section className="user-actions">
          <SpotlightCard className="user-action-card" spotlightColor="rgba(34, 197, 94, 0.2)">
            <div className="user-action-icon">🆘</div>
            <h3 className="user-action-title">Request Assistance</h3>
            <p className="user-action-text">Need fuel or a mechanic? We're here to help.</p>
            <button className="user-action-btn" onClick={openRequestModal}>
              Create Request
            </button>
          </SpotlightCard>

          <SpotlightCard className="user-action-card" spotlightColor="rgba(59, 130, 246, 0.2)">
            <div className="user-action-icon">⛽</div>
            <h3 className="user-action-title">Find Fuel</h3>
            <p className="user-action-text">Locate nearby fuel stations in seconds.</p>
            <button
              className="user-action-btn"
              onClick={openNearestFuelStation}
            >
              View Map
            </button>
          </SpotlightCard>

          <SpotlightCard className="user-action-card" spotlightColor="rgba(168, 85, 247, 0.2)">
            <div className="user-action-icon">📋</div>
            <h3 className="user-action-title">My Activity</h3>
            <p className="user-action-text">Check the status of your recent requests.</p>
            <button className="user-action-btn" onClick={() => setSummaryTab("Active Requests")}>
              View History
            </button>
          </SpotlightCard>
        </section>

        {/* Create Request Modal */}
        {requestModalOpen && (
          <div className="user-request-modal-overlay" onClick={closeRequestModal} role="presentation">
            <div
              className={`user-request-modal ${billPreview ? "user-request-modal--wide" : ""}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="request-modal-title"
            >
              <h2 id="request-modal-title" className="user-request-modal-title">
                Create a Request
              </h2>
              <p className="user-request-modal-desc">All fields are required.</p>
              {requestSuccess ? (
                <p className="user-request-success">{requestSuccess}</p>
              ) : (
                <div className={billPreview ? "user-request-columns" : "user-request-form"}>
                  <div className={billPreview ? "user-request-col-left" : "user-request-form"}>
                    <div className="user-request-field">
                      <label htmlFor="request-vehicle">Vehicle number *</label>
                      <input
                        id="request-vehicle"
                        type="text"
                        value={requestForm.vehicle_number}
                        onChange={(e) =>
                          setRequestForm((prev) => ({ ...prev, vehicle_number: e.target.value.toUpperCase() }))
                        }
                        placeholder="e.g. MH12AB1234"
                        required
                        autoComplete="off"
                        disabled={isFormDisabled}
                      />
                      {requestErrors.vehicle_number && (
                        <span className="user-request-error">{requestErrors.vehicle_number}</span>
                      )}
                    </div>
                    <div className="user-request-field">
                      <label htmlFor="request-licence">Driving licence *</label>
                      <input
                        id="request-licence"
                        type="text"
                        value={requestForm.driving_licence}
                        onChange={(e) =>
                          setRequestForm((prev) => ({ ...prev, driving_licence: e.target.value.toUpperCase() }))
                        }
                        placeholder="Licence number"
                        required
                        autoComplete="off"
                        disabled={isFormDisabled}
                      />
                      {requestErrors.driving_licence && (
                        <span className="user-request-error">{requestErrors.driving_licence}</span>
                      )}
                    </div>
                    <div className="user-request-field">
                      <label htmlFor="request-phone">Phone number *</label>
                      <input
                        id="request-phone"
                        type="tel"
                        value={requestForm.phone_number}
                        onChange={(e) =>
                          setRequestForm((prev) => ({ ...prev, phone_number: e.target.value }))
                        }
                        placeholder="e.g. 9876543210"
                        required
                        autoComplete="tel"
                        disabled={isFormDisabled}
                      />
                      {requestErrors.phone_number && (
                        <span className="user-request-error">{requestErrors.phone_number}</span>
                      )}
                    </div>
                    <div className="user-request-field">
                      <label htmlFor="request-service">Service type *</label>
                      <select
                        id="request-service"
                        value={requestForm.service_type}
                        onChange={(e) =>
                          setRequestForm((prev) => ({ ...prev, service_type: e.target.value }))
                        }
                        required
                        disabled={isFormDisabled}
                      >
                        <option value="">Select service type</option>
                        {SERVICE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {requestErrors.service_type && (
                        <span className="user-request-error">{requestErrors.service_type}</span>
                      )}
                    </div>

                    {/* Fuel Litres Selector - only for fuel services */}
                    {(requestForm.service_type === 'petrol' || requestForm.service_type === 'diesel') && (
                      <div className="user-request-field">
                        <label htmlFor="request-litres">Quantity (Litres) *</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <input
                            id="request-litres"
                            type="range"
                            min={1}
                            max={20}
                            value={fuelLitres}
                            onChange={(e) => setFuelLitres(Number(e.target.value))}
                            style={{ flex: 1, accentColor: '#2563eb' }}
                            disabled={isFormDisabled}
                          />
                          <span style={{
                            minWidth: '60px',
                            padding: '6px 12px',
                            background: 'rgba(37, 99, 235, 0.1)',
                            borderRadius: '8px',
                            fontWeight: 700,
                            color: '#2563eb',
                            textAlign: 'center',
                            fontSize: '1rem'
                          }}>
                            {fuelLitres}L
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Bill Preview shifted to right side below */}

                    <div className="user-request-field">
                      <label>Payment method *</label>
                      <div className="user-payment-options">
                        <label className="user-payment-option">
                          <input
                            type="radio"
                            name="payment-method"
                            value="ONLINE"
                            checked={paymentMethod === "ONLINE"}
                            onChange={() => setPaymentMethod("ONLINE")}
                            disabled={isFormDisabled}
                          />
                          Online (UPI/Card/Wallet)
                        </label>
                        {codEligibility?.allowed && (
                          <label className="user-payment-option">
                            <input
                              type="radio"
                              name="payment-method"
                              value="COD"
                              checked={paymentMethod === "COD"}
                              onChange={() => setPaymentMethod("COD")}
                              disabled={isFormDisabled}
                            />
                            Cash on Delivery
                          </label>
                        )}
                      </div>
                      {checkingCod && (
                        <div className="user-payment-note">Checking COD eligibility…</div>
                      )}
                      {!checkingCod && requestForm.service_type && !requestLocation && !gpsLocation && (
                        <div className="user-payment-note">Allow location access to check COD eligibility.</div>
                      )}
                      {!checkingCod && requestForm.service_type && !requestLocation && !gpsLocation && requestLocationError && (
                        <div className="user-payment-note user-payment-note--error">
                          {requestLocationError} Set your location on the map below.
                        </div>
                      )}
                      {!checkingCod && requestForm.service_type && requestLocation && codEligibility && !codEligibility.allowed && (
                        <div className="user-payment-note">COD not available: {codReasonLabel(codEligibility.reason)}</div>
                      )}
                      {paymentMethod === "ONLINE" && (
                        <div className="user-payment-razorpay">
                          {onlinePaymentStatus !== "success" && (
                            <button
                              type="button"
                              onClick={handleRazorpayPayment}
                              className="user-request-btn user-request-btn-primary"
                              style={{ width: '100%', marginBottom: '10px' }}
                              disabled={!billPreview || onlinePaymentStatus === "pending"}
                            >
                              {onlinePaymentStatus === "pending" ? "Initializing..." : `Pay ₹${billPreview?.total || 0} via Razorpay`}
                            </button>
                          )}

                          {onlinePaymentStatus === "success" && (
                            <div className="user-payment-note user-payment-note--success">
                              ✅ Payment Verified. Order ID: {onlinePaymentId}
                              <p style={{ fontSize: '11px', marginTop: '4px' }}>Click "Create Request" below to confirm.</p>
                            </div>
                          )}

                          {onlinePaymentStatus === "failed" && (
                            <div className="user-payment-note user-payment-note--error">
                              ❌ Payment failed or cancelled.
                              <button
                                type="button"
                                onClick={() => {
                                  sessionStorage.removeItem(ONLINE_PAYMENT_STORAGE_KEY);
                                  setOnlinePaymentStatus("idle");
                                }}
                                style={{ marginLeft: '8px', background: 'none', border: 'none', color: 'blue', textDecoration: 'underline', cursor: 'pointer' }}
                              >
                                Try Again
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {(manualLocationMode || requestLocationError) && (
                      <div className="user-request-field">
                        <label>Pickup location *</label>
                        <RequestLocationPicker
                          value={requestLocation ? { lat: requestLocation.lat, lng: requestLocation.lon } : null}
                          initialCenter={
                            pickerCenter ? { lat: pickerCenter.lat, lng: pickerCenter.lon } : null
                          }
                          onChange={(pos) => {
                            setRequestLocation({ lat: pos.lat, lon: pos.lng });
                            setRequestLocationError(null);
                            setLastKnownLocation({ lat: pos.lat, lon: pos.lng });
                          }}
                        />
                        {requestLocation && (
                          <div className="user-request-location-coords">
                            Selected: {requestLocation.lat.toFixed(5)}, {requestLocation.lon.toFixed(5)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* End of Left Column */}

                  {billPreview && (
                    <div className="user-request-col-right">
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 58, 95, 0.9))',
                        borderRadius: '12px',
                        padding: '1.25rem',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        flex: 1
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '1rem',
                          paddingBottom: '0.75rem',
                          borderBottom: '1px solid rgba(255,255,255,0.1)'
                        }}>
                          <span style={{ fontSize: '1.2rem' }}>🧾</span>
                          <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.95rem' }}>Bill Estimate</span>
                          <span style={{
                            marginLeft: 'auto',
                            fontSize: '0.7rem',
                            color: '#94a3b8',
                            background: 'rgba(255,255,255,0.05)',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}>Live preview</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', fontSize: '0.85rem' }}>
                          {requestForm.service_type === 'petrol' || requestForm.service_type === 'diesel' ? (
                            <>
                              <span style={{ color: '#94a3b8' }}>⛽ Fuel Cost ({fuelLitres}L × {fuelPrices[requestForm.service_type] || 100})</span>
                              <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right' }}>{billPreview.fuel_cost}</span>

                              <span style={{ color: '#94a3b8' }}>🚚 Delivery Fee</span>
                              <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right' }}>{billPreview.delivery_fee}</span>

                              <span style={{ color: '#94a3b8' }}>🏢 Platform Fee (5%)</span>
                              <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right' }}>{billPreview.platform_service_fee}</span>
                            </>
                          ) : (
                            <>
                              <span style={{ color: '#94a3b8' }}>🏢 Requesting Amount</span>
                              <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right' }}>{billPreview.platform_service_fee}</span>
                            </>
                          )}

                          {billPreview.surge_fee > 0 && (
                            <>
                              <span style={{ color: '#f59e0b' }}>⚡ Surge ({billPreview.surge_reasons.join(', ')})</span>
                              <span style={{ color: '#f59e0b', fontWeight: 600, textAlign: 'right' }}>+{billPreview.surge_fee}</span>
                            </>
                          )}
                        </div>

                        <div style={{
                          marginTop: '0.75rem',
                          paddingTop: '0.75rem',
                          borderTop: '1px solid rgba(255,255,255,0.15)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1rem' }}>Total Payable</span>
                          <span style={{
                            fontWeight: 800,
                            color: '#22c55e',
                            fontSize: '1.3rem',
                            textShadow: '0 0 20px rgba(34,197,94,0.3)'
                          }}>{billPreview.total}</span>
                        </div>

                        <div style={{
                          marginTop: '0.6rem',
                          padding: '0.5rem 0.75rem',
                          background: 'rgba(34,197,94,0.08)',
                          borderRadius: '8px',
                          border: '1px solid rgba(34,197,94,0.15)',
                          fontSize: '0.72rem',
                          color: '#94a3b8'
                        }}>
                          {requestForm.service_type === 'petrol' || requestForm.service_type === 'diesel' ? (
                            <>💡 <strong style={{ color: '#4ade80' }}>100% fuel cost</strong> goes to fuel station • Worker gets fair pay with bonuses • Platform earns from service fees</>
                          ) : (
                            <>💡 <strong style={{ color: '#4ade80' }}>Service Charge:</strong> This is a booking fee. Additional charges will be applied by the worker according to the issue of complexity.</>
                          )}
                        </div>

                        <div className="user-request-actions" style={{ marginTop: '2rem' }}>
                          <button type="button" className="user-request-btn user-request-btn-secondary" onClick={closeRequestModal}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={(e) => submitRequest(e)}
                            className="user-request-btn user-request-btn-primary"
                            disabled={
                              requestSubmitting ||
                              (paymentMethod === "ONLINE" && onlinePaymentStatus !== "success")
                            }
                          >
                            {requestSubmitting ? "Creating…" : "Create Request"}
                          </button>
                        </div>
                        {requestErrors.submit && (
                          <p className="user-request-error user-request-error-block">{requestErrors.submit}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {!billPreview && (
                    <>
                      {requestErrors.submit && (
                        <p className="user-request-error user-request-error-block">{requestErrors.submit}</p>
                      )}
                      <div className="user-request-actions">
                        <button type="button" className="user-request-btn user-request-btn-secondary" onClick={closeRequestModal}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={(e) => submitRequest(e)}
                          className="user-request-btn user-request-btn-primary"
                          disabled={
                            requestSubmitting ||
                            (paymentMethod === "ONLINE" && onlinePaymentStatus !== "success")
                          }
                        >
                          {requestSubmitting ? "Creating…" : "Create Request"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {viewingBillReq && (
          <div className="user-request-modal-overlay" onClick={() => setViewingBillReq(null)} role="presentation">
            <div className="user-request-modal" onClick={(e) => e.stopPropagation()} role="dialog">
              <h2 className="user-request-modal-title">Bill Estimation</h2>
              {(() => {
                const details = viewingBillReq.payment_details ? JSON.parse(viewingBillReq.payment_details) : null;
                if (!details) return <p style={{ color: '#94a3b8', textAlign: 'center' }}>Breakdown details unavailable for this order.</p>;
                return (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 58, 95, 0.9))',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    margin: '0.5rem 0'
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', fontSize: '0.9rem' }}>
                      {details.fuel_cost > 0 ? (
                        <>
                          <span style={{ color: '#94a3b8' }}>⛽ Fuel Cost</span>
                          <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right' }}>₹{details.fuel_cost}</span>

                          <span style={{ color: '#94a3b8' }}>🚚 Delivery Fee</span>
                          <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right' }}>₹{details.delivery_fee}</span>

                          <span style={{ color: '#94a3b8' }}>🏢 Platform Fee</span>
                          <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right' }}>₹{details.platform_service_fee}</span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: '#94a3b8' }}>🏢 Booking Charge</span>
                          <span style={{ color: '#e2e8f0', fontWeight: 600, textAlign: 'right' }}>₹{details.platform_service_fee}</span>
                        </>
                      )}

                      {details.surge_fee > 0 && (
                        <>
                          <span style={{ color: '#f59e0b' }}>⚡ Surge ({details.surge_reasons?.join(', ') || 'Peak Hours'})</span>
                          <span style={{ color: '#f59e0b', fontWeight: 600, textAlign: 'right' }}>+₹{details.surge_fee}</span>
                        </>
                      )}
                    </div>

                    <div style={{
                      marginTop: '1rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid rgba(255,255,255,0.15)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '1.1rem' }}>Total Paid</span>
                      <span style={{
                        fontWeight: 800,
                        color: '#22c55e',
                        fontSize: '1.4rem'
                      }}>₹{details.total || viewingBillReq.amount}</span>
                    </div>

                    <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', opacity: 0.8 }}>
                      Payment Mode: {viewingBillReq.status === 'Completed' ? 'Settled' : viewingBillReq.status} • {viewingBillReq.payment_status === 'REFUNDED' ? <span style={{ color: '#ef4444', fontWeight: 'bold' }}>REFUNDED</span> : (viewingBillReq.payment_status || 'Unpaid')} • {viewingBillReq.id}
                    </div>
                  </div>
                );
              })()}
              <div className="user-request-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="user-request-btn user-request-btn-primary" style={{ width: '100%' }} onClick={() => setViewingBillReq(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {ratingRequest && (
          <div className="user-request-modal-overlay" onClick={closeRatingModal} role="presentation">
            <div className="user-request-modal" onClick={(e) => e.stopPropagation()} role="dialog">
              <h2 className="user-request-modal-title">Rate Your Experience</h2>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRatingScore(s)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '2rem',
                      cursor: 'pointer',
                      color: s <= ratingScore ? '#fbbf24' : '#e2e8f0',
                      transition: 'color 0.2s'
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Share your experience or suggestions..."
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#fff'
                }}
              />
              <div className="user-request-actions">
                <button type="button" className="user-request-btn user-request-btn-secondary" onClick={closeRatingModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRatingSubmit}
                  className="user-request-btn user-request-btn-primary"
                  disabled={ratingSubmitting || ratingScore === 0}
                >
                  {ratingSubmitting ? "Submitting..." : "Submit Rating"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Summary */}
        <section className="user-summary-section">
          <nav className="user-summary-tabs">
            <button
              type="button"
              className={`user-summary-tab ${summaryTab === "Overview" ? "user-summary-tab--active" : ""}`}
              onClick={() => setSummaryTab("Overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={`user-summary-tab ${summaryTab === "Active Requests" ? "user-summary-tab--active" : ""}`}
              onClick={() => setSummaryTab("Active Requests")}
            >
              Active Requests
            </button>
            <button
              type="button"
              className={`user-summary-tab ${summaryTab === "History" ? "user-summary-tab--active" : ""}`}
              onClick={() => setSummaryTab("History")}
            >
              History
            </button>
          </nav>
          <div className="user-summary-content">
            {summaryTab === "Overview" && (
              <div className="user-summary-overview">
                <div className="user-summary-overview-kpis">
                  <SpotlightCard className="user-summary-card" spotlightColor="rgba(34, 197, 94, 0.2)">
                    <span className="user-summary-label">Active Requests</span>
                    <span className="user-summary-value">
                      {serviceRequestsLoading ? "…" : serviceRequests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length}
                    </span>
                  </SpotlightCard>
                  <SpotlightCard className="user-summary-card" spotlightColor="rgba(59, 130, 246, 0.2)">
                    <span className="user-summary-label">Total Spent</span>
                    <span className="user-summary-value">
                      {serviceRequestsLoading ? "…" : serviceRequests.filter((r) => r.status === "Completed").reduce((sum, r) => sum + r.amount, 0)}
                    </span>
                  </SpotlightCard>
                </div>

                <div className="user-recent-requests">
                  <h3 className="user-recent-title">Recent Activity</h3>
                  {serviceRequestsLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="skeleton" style={{ height: '4rem' }}></div>
                      <div className="skeleton" style={{ height: '4rem' }}></div>
                    </div>
                  ) : serviceRequests.length === 0 ? (
                    <p className="user-summary-placeholder">No requests found.</p>
                  ) : (
                    <ul className="user-active-requests-list">
                      {serviceRequests.slice(0, 3).map((req) => (
                        <li
                          key={req.id}
                          className="premium-item"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setViewingBillReq(req)}
                        >
                          <div className="premium-item-header">
                            <span className="premium-item-title">{req.vehicle_number}</span>
                            <span className={`user-active-request-status user-active-request-status--${req.status.toLowerCase().replace(" ", "-")}`}>
                              {req.status}
                            </span>
                            {req.status === 'Cancelled' && req.payment_status === 'REFUNDED' && (
                              <span style={{
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                background: 'rgba(34, 197, 94, 0.2)',
                                color: '#4ade80',
                                border: '1px solid rgba(34, 197, 94, 0.4)',
                                borderRadius: '12px',
                                marginLeft: '8px',
                                fontWeight: 500
                              }}>
                                Refunded
                              </span>
                            )}
                          </div>
                          <div className="premium-item-meta">
                            {SERVICE_OPTIONS.find((o) => o.value === req.service_type)?.label ?? req.service_type} · {req.amount}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {summaryTab === "Active Requests" && (
              <>
                {serviceRequestsLoading ? (
                  <p className="user-summary-placeholder">Loading…</p>
                ) : serviceRequests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length === 0 ? (
                  <p className="user-summary-placeholder">No active requests at the moment.</p>
                ) : (
                  <ul className="premium-item-list">
                    {serviceRequests
                      .filter((r) => ACTIVE_STATUSES.includes(r.status))
                      .map((req) => (
                        <li
                          key={req.id}
                          className="premium-item"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setViewingBillReq(req)}
                        >
                          <div className="premium-item-header">
                            <span className="premium-item-title">{req.vehicle_number}</span>
                            <span className={`premium-item-status premium-item-status--${req.status.toLowerCase().replace(" ", "-")}`}>
                              {req.status}
                            </span>
                            {req.status === 'Cancelled' && req.payment_status === 'REFUNDED' && (
                              <span style={{
                                fontSize: '0.75rem',
                                padding: '2px 8px',
                                background: 'rgba(34, 197, 94, 0.2)',
                                color: '#4ade80',
                                border: '1px solid rgba(34, 197, 94, 0.4)',
                                borderRadius: '12px',
                                marginLeft: '8px',
                                fontWeight: 600
                              }}>
                                Refunded
                              </span>
                            )}
                          </div>
                          <div className="premium-item-meta">
                            {SERVICE_OPTIONS.find((o) => o.value === req.service_type)?.label ?? req.service_type} · {req.amount}
                            {" · "}
                            {(() => {
                              const d = new Date(req.created_at);
                              return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                            })()}
                            {["Pending", "Assigned"].includes(req.status) && (
                              <div style={{ marginTop: '0.75rem' }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCancelConfRequest(req);
                                  }}
                                  style={{
                                    fontSize: '0.75rem',
                                    padding: '4px 10px',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    color: '#f87171',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                    fontWeight: 500
                                  }}
                                >
                                  Cancel Request
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
            {summaryTab === "History" && (
              <>
                {serviceRequestsLoading ? (
                  <p className="user-summary-placeholder">Loading…</p>
                ) : serviceRequests.filter((r) => HISTORY_STATUSES.includes(r.status)).length === 0 ? (
                  <p className="user-summary-placeholder">No history yet.</p>
                ) : (
                  <ul className="user-history-list">
                    {serviceRequests
                      .filter((r) => HISTORY_STATUSES.includes(r.status))
                      .map((req) => (
                        <li
                          key={req.id}
                          className="user-history-item"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setViewingBillReq(req)}
                        >
                          <div className="user-history-row">
                            <span className="user-history-vehicle">{req.vehicle_number}</span>
                            <span className={`user-history-status user-history-status--${req.status.toLowerCase().replace(" ", "-")}`}>
                              {req.status}
                            </span>
                            {req.status === 'Cancelled' && req.payment_status === 'REFUNDED' && (
                              <span style={{
                                fontSize: '0.75rem',
                                padding: '2px 8px',
                                background: 'rgba(34, 197, 94, 0.2)',
                                color: '#4ade80',
                                border: '1px solid rgba(34, 197, 94, 0.4)',
                                borderRadius: '12px',
                                marginLeft: '8px',
                                fontWeight: 600
                              }}>
                                Refunded
                              </span>
                            )}
                          </div>
                          <div className="user-history-meta">
                            {SERVICE_OPTIONS.find((o) => o.value === req.service_type)?.label ?? req.service_type} · {req.amount}
                            {" · "}
                            {(() => {
                              const d = new Date(req.created_at);
                              const day = String(d.getDate()).padStart(2, "0");
                              const month = String(d.getMonth() + 1).padStart(2, "0");
                              const year = String(d.getFullYear()).slice(-2);
                              const hours = String(d.getHours()).padStart(2, "0");
                              const mins = String(d.getMinutes()).padStart(2, "0");
                              return `${day}/${month}/${year} ${hours}:${mins}`;
                            })()}
                            {req.status === "Completed" && (
                              <div style={{ marginTop: '0.5rem' }}>
                                {req.rating ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', color: '#fbbf24' }}>
                                    <span>{'★'.repeat(req.rating)}</span>
                                    <span style={{ color: '#94a3b8' }}>({req.rating}/5)</span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openRatingModal(req);
                                    }}
                                    style={{
                                      fontSize: '0.8rem',
                                      padding: '4px 12px',
                                      background: '#2563eb',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      marginTop: '4px'
                                    }}
                                  >
                                    Rate Worker
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>

        {cancelConfRequest && (
          <div className="user-request-modal-overlay" onClick={() => setCancelConfRequest(null)} role="presentation">
            <div className="user-request-modal" onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: '400px' }}>
              <h2 className="user-request-modal-title" style={{ color: '#ef4444' }}>Cancel Request?</h2>
              <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                {cancelConfRequest.payment_status === 'PAID'
                  ? `Are you sure you want to cancel this request? Your payment of ₹${cancelConfRequest.amount} will be fully refunded to your original payment method within 2-3 hours.`
                  : "Are you sure you want to cancel this request? This action cannot be undone."}
              </p>
              <div className="user-request-actions">
                <button
                  type="button"
                  className="user-request-btn user-request-btn-secondary"
                  onClick={() => setCancelConfRequest(null)}
                >
                  No, Keep it
                </button>
                <button
                  type="button"
                  className="user-request-btn"
                  onClick={() => {
                    handleUserCancelRequest(cancelConfRequest.id);
                    setCancelConfRequest(null);
                  }}
                  style={{
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    fontWeight: 600
                  }}
                >
                  Yes, Cancel Request
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div >
  );
}
