"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotification } from "@/app/NotificationSystem";
import BackgroundPaths from "../BackgroundPaths";
import SpotlightCard from "../SpotlightCard";

const AdminMap = dynamic(() => import("../admin/AdminMap"), { ssr: false });
const FuelStationAssignment = dynamic(() => import("./FuelStationAssignment"), { ssr: false });

type ServiceRequest = {
  id: number;
  user_id: number | null;
  user_first_name?: string | null;
  user_last_name?: string | null;
  assigned_worker: number | null;
  vehicle_number: string;
  driving_licence: string;
  phone_number: string;
  service_type: string;
  amount: number;
  status: string;
  created_at: string;
  user_lat: number | null;
  user_lon: number | null;
  payment_method?: string;
  litres?: number;
  fuel_station_name?: string | null;
  fuel_station_lat?: number | null;
  fuel_station_lon?: number | null;
  worker_payout?: number | null;
  distance_km?: number | null;
};

type SettlementInfo = {
  customer: { fuel_cost: number; delivery_fee: number; platform_service_fee: number; surge_fee: number; total: number };
  worker: { base_pay: number; distance_pay: number; surge_bonus: number; total: number };
  fuel_station: { payout: number };
};

type WorkerPayout = {
  id: number;
  amount: number;
  reference_id?: string | null;
  created_at: string;
};

const ACTIVE_STATUSES = ["Assigned", "In Progress"];
const HISTORY_STATUSES = ["Completed", "Cancelled"];

function sameNumericId(a: number | string | null | undefined, b: number | string | null | undefined) {
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

// Helper for distance calculation (metres) using Haversine formula
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

// Helper to estimate worker payout
function getWorkerPayout(
  distanceMetres: number | null,
  serviceType: string = 'petrol',
  config: { basePay?: number; perKmRate?: number; minGuarantee?: number } = {}
) {
  const { basePay = 50, perKmRate = 10, minGuarantee = 100 } = config;
  const isFuel = serviceType === 'petrol' || serviceType === 'diesel';

  if (isFuel) {
    const distanceKm = distanceMetres ? distanceMetres / 1000 : 0;
    const distancePay = distanceKm * perKmRate;
    return Math.max(basePay + distancePay, minGuarantee);
  }
  // Non-fuel: Base pay only as rest is collected directly
  return basePay;
}

export default function WorkerDashboardPage() {
  const { showToast, showConfirm } = useNotification();
  const [worker, setWorker] = useState<{
    first_name: string;
    id: number;
    service_type: string;
    status: string;
    status_locked?: number;
    verified?: number;
    floater_cash?: number;
    last_cash_collection_at?: string;
    docs_submitted_at?: string;
    lock_reason?: string;
    base_pay_per_order?: number;
    per_km_rate?: number;
    minimum_guaranteed_pay?: number;
  } | null>(null);
  const [summaryTab, setSummaryTab] = useState<"Overview" | "Active Tasks" | "History">("Overview");
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [workerPos, setWorkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [busyNotice, setBusyNotice] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [docFiles, setDocFiles] = useState<{ license: string; self: string }>({ license: "", self: "" });
  const busyNoticeTimer = useRef<number | null>(null);
  const lastLocationSentRef = useRef<number>(0);
  const router = useRouter();
  const [activeSettlement, setActiveSettlement] = useState<Record<number, SettlementInfo>>({});
  const [totalPayoutsReceived, setTotalPayoutsReceived] = useState(0);
  const [payoutHistory, setPayoutHistory] = useState<WorkerPayout[]>([]);
  const [showPayoutHistory, setShowPayoutHistory] = useState(false);

  const handleLogout = async () => {
    if (worker?.id) {
      const hasActive = activeTasks.length > 0;
      if (!hasActive) {
        try {
          localStorage.setItem("worker_prev_status", worker.status || "Available");
          await updateWorkerStatus(worker.id, "Offline");
        } catch {
          // ignore logout status update failures
        }
      }
    }
    localStorage.removeItem("agf_user");
    router.push("/login");
  };

  const fetchTasks = useCallback(async () => {
    if (!worker?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/service-requests`);
      const allRequests: ServiceRequest[] = res.ok ? await res.json() : [];
      setServiceRequests(allRequests);
    } catch (err) {
      setServiceRequests([]);
    } finally {
      setLoading(false);
    }
  }, [worker?.id]);

  const refreshWorker = useCallback(async (workerId: number) => {
    try {
      const res = await fetch(`/api/workers?id=${workerId}`);
      if (!res.ok) return null;
      const workerData = await res.json();
      setWorker(workerData);
      return workerData;
    } catch {
      return null;
    }
  }, []);

  const updateWorkerStatus = useCallback(
    async (workerId: number, status: "Available" | "Busy" | "Offline") => {
      try {
        const res = await fetch("/api/workers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: workerId, status }),
        });
        if (res.ok) {
          await refreshWorker(workerId);
          return true;
        }

        const data = await res.json().catch(() => null);
        if (res.status === 403 && data?.locked) {
          await refreshWorker(workerId);
        }
        return false;
      } catch {
        return false;
      }
    },
    [refreshWorker]
  );

  useEffect(() => {
    const init = async () => {
      try {
        const raw = typeof window !== "undefined" ? localStorage.getItem("agf_user") : null;
        if (raw) {
          const data = JSON.parse(raw);
          if (data.id) {
            const res = await fetch(`/api/workers?id=${data.id}`);
            if (res.ok) {
              const workerData = await res.json();
              setWorker(workerData);
              const prevStatus = localStorage.getItem("worker_prev_status");
              if (
                prevStatus &&
                workerData?.status === "Offline" &&
                !workerData?.status_locked
              ) {
                const normalizedPrev = prevStatus === "Busy" ? "Busy" : "Available";
                const restored = await updateWorkerStatus(workerData.id, normalizedPrev);
                if (restored) {
                  localStorage.removeItem("worker_prev_status");
                }
              }
            }
          }
        }
      } catch (_) { }
    };
    init();
  }, []);

  useEffect(() => {
    if (worker?.id) fetchTasks();
  }, [worker?.id, fetchTasks]);

  useEffect(() => {
    if (worker?.id) {
      fetch(`/api/payouts?worker_id=${worker.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          const payouts = Array.isArray(data) ? data : [];
          const total = payouts.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
          setPayoutHistory(payouts);
          setTotalPayoutsReceived(total);
        })
        .catch(() => {
          setPayoutHistory([]);
          setTotalPayoutsReceived(0);
        });
    }
  }, [worker?.id]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowPayoutHistory(false);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  useEffect(() => {
    if (!worker?.id) return;
    const interval = setInterval(() => fetchTasks(), 5000);
    return () => clearInterval(interval);
  }, [worker?.id, fetchTasks]);

  useEffect(() => {
    return () => {
      if (busyNoticeTimer.current) {
        window.clearTimeout(busyNoticeTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!worker?.id || !workerPos) return;
    const now = Date.now();
    if (now - lastLocationSentRef.current < 10000) return;
    lastLocationSentRef.current = now;
    fetch("/api/workers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: worker.id, latitude: workerPos.lat, longitude: workerPos.lng }),
    }).catch(() => {
      // ignore location update failures
    });
  }, [worker?.id, workerPos]);

  const showBusyNotice = (message?: string) => {
    setBusyMessage(message || "Your Role is Currently Busy make it available to accept the order");
    setBusyNotice(true);
    if (busyNoticeTimer.current) {
      window.clearTimeout(busyNoticeTimer.current);
    }
    busyNoticeTimer.current = window.setTimeout(() => {
      setBusyNotice(false);
    }, 2000);
  };

  const handleAssignmentReceived = useCallback((taskId: number, assignment: any) => {
    setServiceRequests(prev => prev.map(r => r.id === taskId ? {
      ...r,
      fuel_station_name: assignment.name,
      fuel_station_lat: assignment.lat,
      fuel_station_lon: assignment.lng
    } : r));
  }, []);

  const updateTaskStatus = async (id: number, newStatus: string) => {
    try {
      const res = await fetch("/api/service-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (res.ok) {
        // If completing, set worker back to Available
        if (newStatus === "Completed" && worker) {
          await updateWorkerStatus(worker.id, "Available");
        }
        fetchTasks();
      }
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const acceptTask = async (requestId: number) => {
    if (!worker?.id) return;
    if (!canAcceptRequests) return;
    setLoading(true);
    try {
      const res = await fetch("/api/service-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId,
          status: "Assigned",
          assigned_worker: worker.id
        }),
      });

      if (res.ok) {
        setServiceRequests((prev) =>
          prev.map((r) =>
            r.id === requestId ? { ...r, status: "Assigned", assigned_worker: Number(worker.id) } : r
          )
        );
        await updateWorkerStatus(worker.id, "Busy");
        setSummaryTab("Active Tasks");
        fetchTasks();
      } else {
        if (res.status === 409) {
          showBusyNotice("You already have an active task. Complete it to accept another job.");
        }
      }
    } catch (err) {
      console.error("Failed to accept task", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptClick = (requestId: number) => {
    if (!canAcceptRequests) {
      if (worker?.status === "Offline") {
        showBusyNotice("You are Offline. Switch to Available to accept jobs.");
      } else if (worker?.status === "Busy") {
        showBusyNotice();
      } else if (activeTasks.length > 0) {
        showBusyNotice("You already have an active task. Complete it to accept another job.");
      }
      return;
    }
    acceptTask(requestId);
  };

  const cancelTask = async (requestId: number) => {
    if (!worker?.id) return;
    const confirmed = await showConfirm("Are you sure you want to cancel this job? This will make it available for other workers.");
    if (!confirmed) return;

    setLoading(true);
    try {
      // 1. Reset request to Pending and clear worker assignment
      const res = await fetch("/api/service-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId,
          status: "Pending",
          assigned_worker: null
        }),
      });

      if (res.ok) {
        // 2. Set worker back to Available
        await updateWorkerStatus(worker.id, "Available");
        fetchTasks();
      }
    } catch (err) {
      console.error("Failed to cancel task", err);
    } finally {
      setLoading(false);
    }
  };

  const openNavigation = (taskId: number, lat: number | null, lon: number | null, label: string) => {
    if (lat == null || lon == null) return;

    // Automatically start job if not already started
    const task = serviceRequests.find(r => r.id === taskId);
    if (task && task.status === "Assigned") {
      setServiceRequests(prev => prev.map(r => r.id === taskId ? { ...r, status: "In Progress" } : r));
      updateTaskStatus(taskId, "In Progress");
    }

    console.log(`Navigating to ${label}:`, lat, lon);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDocUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worker?.id || !docFiles.license || !docFiles.self) return;

    setUploading(true);
    try {
      const res = await fetch("/api/workers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: worker.id,
          license_photo: docFiles.license,
          self_photo: docFiles.self,
          submit_docs: true
        }),
      });

      if (res.ok) {
        setUploadSuccess(true);
        // Refresh worker data to show "Waiting" state
        const updatedRes = await fetch(`/api/workers?id=${worker.id}`);
        if (updatedRes.ok) setWorker(await updatedRes.json());
      }
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (field: 'license' | 'self', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDocFiles(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const matchesRole = (reqType: string, workerRole: string) => {
    const roleMap: Record<string, string> = {
      "petrol": "Delivery",
      "diesel": "Delivery",
      "crane": "Crane",
      "mechanic_bike": "Mechanic Bike",
      "mechanic_car": "Mechanic Car"
    };
    return roleMap[reqType] === workerRole;
  };

  const isOffline = worker?.status === "Offline";
  const isVerified = !!worker?.verified;

  const activeTasks = serviceRequests.filter(
    (r) => sameNumericId(r.assigned_worker, worker?.id) && ACTIVE_STATUSES.includes(r.status)
  );

  const historyTasks = serviceRequests.filter(
    (r) => sameNumericId(r.assigned_worker, worker?.id) && HISTORY_STATUSES.includes(r.status)
  );

  const hasActiveTask = activeTasks.length > 0;
  const canAcceptRequests = worker?.status === "Available" && isVerified && !hasActiveTask;
  const canSeeRequests = !isOffline && isVerified;

  const matchingPendingTasks = canSeeRequests
    ? serviceRequests.filter((r) =>
      r.status === "Pending" && worker?.service_type && matchesRole(r.service_type, worker.service_type)
    )
    : [];

  const totalEarnings = historyTasks.reduce((sum, t) => {
    if (t.status !== 'Completed') return sum;
    if (t.worker_payout != null) return sum + t.worker_payout;

    // Fallback estimation if settlement record is missing
    const dist = t.distance_km ? t.distance_km * 1000 : 0;
    return sum + getWorkerPayout(dist, t.service_type, {
      basePay: worker?.base_pay_per_order,
      perKmRate: worker?.per_km_rate,
      minGuarantee: worker?.minimum_guaranteed_pay
    });
  }, 0);

  const currentBalance = Math.max(0, totalEarnings - totalPayoutsReceived);

  return (
    <div className="worker-dashboard">
      {busyNotice && (
        <div className="worker-toast" role="status" aria-live="polite">
          {busyMessage}
        </div>
      )}
      <div className="worker-main-container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
        <div className="premium-breadcrumb">
          <span className="back-link">
            Home
          </span>
          <span>/ worker-mission-control</span>
        </div>

        <section className="worker-welcome-section" style={{ position: 'relative' }}>
          <BackgroundPaths />
          <button
            onClick={handleLogout}
            className="premium-logout-btn"
            style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 10 }}
          >
            Logout
          </button>
          <div className="worker-welcome-logo">AGF Worker</div>
          <h1 className="worker-welcome-title">Hello, {worker?.first_name || "Worker"}!</h1>
          <p className="worker-welcome-subtitle">
            Specialization: <span className="premium-accent">{worker?.service_type || "Worker"}</span>.
            {activeTasks.length > 0 ? (
              <span> You have <span className="premium-success">{activeTasks.length} active tasks</span>.</span>
            ) : (
              <span>
                You are currently:{" "}
                <span className={`status-badge ${(worker?.status || "Unavailable").toLowerCase()}`}>
                  {worker?.status || "Unavailable"}
                </span>
                {!!worker?.status_locked ? " (Account Locked)" : ""}
              </span>
            )}
            {!!worker?.status_locked && worker?.lock_reason === "Low Rating" && (
              <div style={{ marginTop: '0.5rem', color: '#ef4444', fontWeight: 'bold' }}>
                Account Locked: Please contact Administrator.
              </div>
            )}
            {(worker?.floater_cash || 0) >= 1500 && (
              <div style={{ marginTop: '0.5rem', color: '#ef4444', fontWeight: 'bold' }}>
                ⚠️ Collection Limit Reached! Please pay {worker?.floater_cash?.toFixed(2)} to Admin to unlock your status.
              </div>
            )}
          </p>
        </section>

        <section className="worker-section">
          <div className="worker-section-header">
            <div>
              <h2 className="worker-section-title">Operational Map</h2>
              <p className="worker-section-subtitle">Real-time view of your live location and tasks.</p>
            </div>
            <div className="worker-map-controls">
              <span className="worker-live-pill">
                <span className="worker-live-dot" /> Tracking Live
              </span>
            </div>
          </div>
          <div className="worker-map-container">
            <AdminMap
              popupLabel="You (Live)"
              mapClassName="admin-leaflet-map"
              wrapClassName="admin-leaflet-wrap"
              watchPosition={true}
              userMarkerType="bike"
              onPositionChange={(pos) => setWorkerPos(pos)}
              serviceRequests={[...activeTasks, ...matchingPendingTasks]}
            />
          </div>
        </section>

        {/* Action Cards */}
        <section className="worker-actions">
          <SpotlightCard className="worker-action-card" spotlightColor="rgba(34, 197, 94, 0.2)">
            <button type="button" className={`worker-action-card-inner ${activeTasks.length > 0 ? 'worker-action-primary' : ''}`} onClick={() => setSummaryTab("Active Tasks")} style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', padding: 0 }}>
              <span className="worker-action-icon">📋</span>
              <span className="worker-action-title">My Tasks    </span>
              <span className="worker-action-desc">{activeTasks.length} Active Jobs</span>
            </button>
          </SpotlightCard>

          <SpotlightCard className="worker-action-card" spotlightColor="rgba(59, 130, 246, 0.2)">
            <button type="button" className="worker-action-card-inner" onClick={() => setSummaryTab("History")} style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', padding: 0 }}>
              <span className="worker-action-icon">🕒</span>
              <span className="worker-action-title">History </span>
              <span className="worker-action-desc">{historyTasks.length} Completed</span>
            </button>
          </SpotlightCard>

          <SpotlightCard className="worker-action-card" spotlightColor="rgba(168, 85, 247, 0.2)">
            <button
              type="button"
              className="worker-action-card-inner"
              onClick={() => setShowPayoutHistory(true)}
              style={{ textDecoration: 'none', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <span className="worker-action-icon">💳</span>
              <span className="worker-action-title">Wallet Balance</span>
              <span className="worker-action-desc">₹{currentBalance.toFixed(0)} (Withdrawable)</span>
            </button>
          </SpotlightCard>

          <SpotlightCard className="worker-action-card" spotlightColor="rgba(234, 179, 8, 0.2)">
            <div className="worker-action-card-inner" style={{ textDecoration: 'none' }}>
              <span className="worker-action-icon">💸</span>
              <span className="worker-action-title">Floater Cash</span>
              <span className="worker-action-desc" style={{ color: (worker?.floater_cash || 0) >= 1200 ? '#ef4444' : 'inherit' }}>
                {worker?.floater_cash?.toFixed(2) || "0.00"} / 1500
              </span>
            </div>
          </SpotlightCard>

          <SpotlightCard className="worker-action-card" spotlightColor="rgba(249, 115, 22, 0.2)">
            <Link href="/worker/profile" className="worker-action-card-inner" style={{ textDecoration: 'none' }}>
              <span className="worker-action-icon">👤</span>
              <span className="worker-action-title">Profile </span>
              <span className="worker-action-title">Settings</span>
            </Link>
          </SpotlightCard>
        </section>

        {/* Identity Verification Section */}
        {!isVerified && (
          <section className="worker-section" style={{ marginTop: '2rem' }}>
            <SpotlightCard className="verification-card" spotlightColor="rgba(234, 179, 8, 0.15)">
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: '#fff' }}>
                  Verify Your Identity
                </h3>

                {worker?.docs_submitted_at && (
                  <div style={{ padding: '1.5rem', backgroundColor: 'rgba(234, 179, 8, 0.1)', borderRadius: '8px', border: '1px solid #eab308', marginBottom: '1rem' }}>
                    <div style={{ color: '#fbbf24', fontWeight: 600, fontSize: '1.1rem' }}>
                      ⏳ Verification Pending
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                      Documents submitted on:{" "}
                      <span style={{ color: '#fff', fontWeight: 500 }}>
                        {(() => {
                          if (!worker.docs_submitted_at) return "—";
                          // Ensure we parse the DB string correctly as local time
                          const dateStr = worker.docs_submitted_at.includes("T")
                            ? worker.docs_submitted_at
                            : worker.docs_submitted_at.replace(" ", "T");
                          const d = new Date(dateStr);

                          const format = (date: Date) => {
                            const day = String(date.getDate()).padStart(2, "0");
                            const month = String(date.getMonth() + 1).padStart(2, "0");
                            const year = date.getFullYear();
                            let hours = date.getHours();
                            const minutes = String(date.getMinutes()).padStart(2, "0");
                            const ampm = hours >= 12 ? "PM" : "AM";
                            hours = hours % 12 || 12;
                            return `${day}/${month}/${year}, ${hours}:${minutes} ${ampm}`;
                          };

                          const targetDate = new Date(d.getTime() + 24 * 60 * 60 * 1000);
                          return (
                            <>
                              {format(d)}
                              <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.85rem' }}>
                                🏁 <span style={{ color: '#94a3b8' }}>Expected Verification:</span>{" "}
                                <span style={{ color: '#4ade80', fontWeight: 600 }}>{format(targetDate)}</span>
                              </div>
                            </>
                          );
                        })()}
                      </span>
                      <br />
                      Your account will be <strong>automatically verified in 24 hours</strong> after this timestamp.
                    </div>
                  </div>
                )}

                {!worker?.docs_submitted_at && (
                  uploadSuccess ? (
                    <div style={{ padding: '1rem', backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', border: '1px solid #22c55e' }}>
                      <p style={{ color: '#4ade80', fontWeight: 600 }}>Documents uploaded successfully!</p>
                      <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Please wait 24 hours for auto-verification to complete.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleDocUpload} style={{ display: 'grid', gap: '1.5rem', maxWidth: '500px', margin: '1.5rem auto' }}>
                      <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>Driving License Photo</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileChange('license', e)}
                          required
                          style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}
                        />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>Selfie Photo</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileChange('self', e)}
                          required
                          style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={uploading}
                        className="worker-btn worker-btn-primary"
                        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                      >
                        {uploading ? "Uploading..." : "Submit for 24h Auto-Verify"}
                      </button>
                    </form>
                  )
                )}
              </div>
            </SpotlightCard>
          </section>
        )}

        <section className="worker-summary-section" style={{ minHeight: '400px' }}>
          <nav className="worker-summary-tabs">
            <button
              className={`worker-summary-tab ${summaryTab === "Overview" ? "worker-summary-tab--active" : ""}`}
              onClick={() => setSummaryTab("Overview")}
            >
              Overview
            </button>
            <button
              className={`worker-summary-tab ${summaryTab === "Active Tasks" ? "worker-summary-tab--active" : ""}`}
              onClick={() => setSummaryTab("Active Tasks")}
            >
              {activeTasks.length > 0 ? `Active Jobs (${activeTasks.length})` : (matchingPendingTasks.length > 0 ? `Available (${matchingPendingTasks.length})` : 'Available')}
            </button>
            <button
              className={`worker-summary-tab ${summaryTab === "History" ? "worker-summary-tab--active" : ""}`}
              onClick={() => setSummaryTab("History")}
            >
              History
            </button>
          </nav>

          <div className="worker-summary-content">
            {summaryTab === "Overview" && (
              <div className="worker-summary-overview">
                <div className="worker-overview-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', width: '100%' }}>
                  <SpotlightCard className="worker-summary-card" spotlightColor="rgba(34, 197, 94, 0.2)">
                    <span className="worker-summary-label">Total Jobs Done </span>
                    <span className="worker-summary-value">{historyTasks.length}</span>
                  </SpotlightCard>
                  <SpotlightCard className="worker-summary-card" spotlightColor="rgba(59, 130, 246, 0.2)">
                    <span className="worker-summary-label">Wallet Balance (Payout)</span>
                    <span className="worker-summary-value" style={{ color: '#16a34a' }}>₹{currentBalance.toFixed(0)}</span>
                  </SpotlightCard>
                </div>

                <div className="worker-recommended-tasks" style={{ marginTop: '2rem', width: '100%' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginBottom: '1rem' }}>Available Job Portal</h3>
                  {matchingPendingTasks.length === 0 ? (
                    <p className="worker-summary-placeholder">
                      {!isVerified
                        ? "Profile not verified yet."
                        : isOffline
                          ? "You're offline. Switch to Available to see requests."
                          : "No matching requests available. Stay online to receive jobs."}
                    </p>
                  ) : (
                    <ul className="worker-tasks-list">
                      {matchingPendingTasks.slice(0, 3).map(task => (
                        <li key={task.id} className="worker-task-item">
                          <div className="worker-task-row">
                            <span className="worker-task-vehicle">{task.vehicle_number}</span>
                            <button
                              className="worker-btn worker-btn-primary"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                              aria-disabled={!canAcceptRequests}
                              title={canAcceptRequests ? "Accept job" : "You are busy or offline"}
                              onClick={() => handleAcceptClick(task.id)}
                            >
                              Accept Job
                            </button>
                          </div>
                          <div className="worker-task-meta">
                            {(() => {
                              const dist = (workerPos && task.user_lat && task.user_lon)
                                ? getDistance(workerPos.lat, workerPos.lng, task.user_lat, task.user_lon)
                                : null;
                              const payout = getWorkerPayout(dist, task.service_type, {
                                basePay: worker?.base_pay_per_order,
                                perKmRate: worker?.per_km_rate,
                                minGuarantee: worker?.minimum_guaranteed_pay
                              });
                              const isFuel = task.service_type === 'petrol' || task.service_type === 'diesel';
                              return (
                                <>
                                  <span style={{ textTransform: 'capitalize' }}>{task.service_type.replace("_", " ")}</span>
                                  {" · "}
                                  {task.payment_method === 'COD' ? (
                                    <>
                                      <span className="premium-accent">Collect: ₹{task.amount}</span>
                                      {" · "}
                                      <span className="premium-success">Payout: ₹{payout.toFixed(0)}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="premium-success">App Payout: ₹{payout.toFixed(0)}</span>
                                      {!isFuel && (
                                        <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '4px', fontWeight: 600, background: 'rgba(251, 191, 36, 0.1)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                          ⚠️ Collect Service Charges
                                        </div>
                                      )}
                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {summaryTab === "Active Tasks" && (
              <div className="worker-tasks">
                {(activeTasks.length === 0 && matchingPendingTasks.length === 0) ? (
                  <p className="worker-summary-placeholder">
                    {!isVerified ? "Profile not verified yet." : "No active or available tasks at the moment."}
                  </p>
                ) : activeTasks.length > 0 ? (
                  <ul className="worker-tasks-list">
                    {activeTasks.map((task) => {
                      // Calculate distance to user
                      const distance = (workerPos && task.user_lat && task.user_lon)
                        ? getDistance(workerPos.lat, workerPos.lng, task.user_lat, task.user_lon)
                        : null;

                      const isNearby = distance !== null && distance <= 100;
                      const isFuel = task.service_type === 'petrol' || task.service_type === 'diesel';

                      return (
                        <li key={task.id} className="worker-task-item">
                          <div className="worker-task-row">
                            <span className="worker-task-vehicle">{task.vehicle_number}</span>
                            <span className={`worker-task-status worker-status-${task.status.toLowerCase().replace(" ", "")}`}>
                              {task.status}
                            </span>
                          </div>
                          <div className="worker-task-meta">
                            <span style={{ textTransform: 'capitalize' }}>{task.service_type.replace("_", " ")}</span>
                            {" · "}
                            {(() => {
                              const payout = getWorkerPayout(distance, task.service_type, {
                                basePay: worker?.base_pay_per_order,
                                perKmRate: worker?.per_km_rate,
                                minGuarantee: worker?.minimum_guaranteed_pay
                              });
                              return task.payment_method === 'COD' ? (
                                <>
                                  <span className="premium-accent">Collect: ₹{task.amount}</span>
                                  {" · "}
                                  <span className="premium-success">Payout: ₹{payout.toFixed(0)}</span>
                                </>
                              ) : (
                                <>
                                  <span className="premium-success">App Payout: ₹{payout.toFixed(0)}</span>
                                  {!isFuel && (
                                    <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '4px', fontWeight: 600, background: 'rgba(251, 191, 36, 0.1)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                      ⚠️ Collect Service Charges from User
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                            {" · "}
                            <span className="worker-user-name">
                              {(task.user_first_name || task.user_last_name)
                                ? `${task.user_first_name || ""} ${task.user_last_name || ""}`.trim()
                                : "User"}
                            </span>{" "}
                            · Contact:{" "}
                            <a className="worker-phone-link" href={`tel:${task.phone_number}`}>
                              {task.phone_number}
                            </a>
                            {(task.service_type === 'petrol' || task.service_type === 'diesel') && task.fuel_station_name && (
                              <>
                                {" · "}
                                <span className="premium-accent">Pump: {task.fuel_station_name}</span>
                              </>
                            )}
                          </div>

                          {/* Fuel Station Assignment Integration */}
                          {(task.service_type === 'petrol' || task.service_type === 'diesel') && workerPos && (
                            <div style={{ marginTop: '1rem' }}>
                              <FuelStationAssignment
                                workerId={worker!.id}
                                serviceRequestId={task.id}
                                workerLat={workerPos.lat}
                                workerLng={workerPos.lng}
                                fuelType={task.service_type}
                                litres={task.litres || 5}
                                isCod={task.payment_method === 'COD'}
                                onAssignmentReceived={(assignment) => handleAssignmentReceived(task.id, assignment)}
                              />
                            </div>
                          )}

                          {/* Location Check Section */}
                          <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '8px', marginTop: '0.75rem', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Customer Location:</span>
                              <span style={{ fontSize: '0.85rem', color: isNearby ? '#16a34a' : '#ea580c', fontWeight: 600 }}>
                                {distance !== null ? `${distance.toFixed(1)}m away` : 'Locating...'}
                              </span>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                              {isNearby
                                ? "✅ You are at the destination. You can now complete the job."
                                : "📍 Close to target? You must be within 100m to finish."}
                            </p>
                          </div>

                          <div className="worker-task-actions" style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>

                            {(task.service_type === "petrol" || task.service_type === "diesel") && (
                              <button
                                className="worker-btn"
                                style={{
                                  backgroundColor: '#fff',
                                  color: '#16a34a',
                                  border: '1px solid #bbf7d0',
                                  flex: 2,
                                  fontSize: '0.8rem',
                                  fontWeight: 700
                                }}
                                disabled={task.fuel_station_lat == null || task.fuel_station_lon == null}
                                title={task.fuel_station_lat == null || task.fuel_station_lon == null ? "No pump assigned yet" : "Navigate to assigned fuel station"}
                                onClick={() => openNavigation(task.id, task.fuel_station_lat ?? null, task.fuel_station_lon ?? null, "Pump")}
                              >
                                Navigate to Pump
                              </button>
                            )}
                            <button
                              className="worker-btn"
                              style={{
                                backgroundColor: '#fff',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                flex: 2,
                                fontSize: '0.8rem',
                                fontWeight: 700
                              }}
                              disabled={task.user_lat == null || task.user_lon == null}
                              title={task.user_lat == null || task.user_lon == null ? "User location unavailable" : "Navigate to customer location"}
                              onClick={() => openNavigation(task.id, task.user_lat, task.user_lon, "Customer")}
                            >
                              Navigate to Customer
                            </button>
                            <button
                              className={`worker-btn ${isNearby ? 'worker-btn-success' : ''}`}
                              style={{
                                backgroundColor: isNearby ? '#22c55e' : '#e2e8f0',
                                color: isNearby ? '#fff' : '#94a3b8',
                                cursor: isNearby ? 'pointer' : 'not-allowed',
                                opacity: isNearby ? 1 : 0.7,
                                flex: 2
                              }}
                              disabled={!isNearby}
                              onClick={() => updateTaskStatus(task.id, "Completed")}
                            >
                              Complete Job
                            </button>
                            <button
                              className="worker-btn"
                              style={{
                                backgroundColor: '#fff',
                                color: task.status === "In Progress" ? '#94a3b8' : '#ef4444',
                                border: `1px solid ${task.status === "In Progress" ? '#e2e8f0' : '#fecaca'}`,
                                flex: 1,
                                fontSize: '0.8rem',
                                cursor: task.status === "In Progress" ? 'not-allowed' : 'pointer'
                              }}
                              disabled={task.status === "In Progress"}
                              title={task.status === "In Progress" ? "Cannot cancel once navigation has started" : "Cancel Job"}
                              onClick={() => cancelTask(task.id)}
                            >
                              Cancel Job
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="worker-recommended-tasks">
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#94a3b8', marginBottom: '1rem' }}>Open Requests:</h3>
                    <ul className="worker-tasks-list">
                      {matchingPendingTasks.map((task) => (
                        <li key={task.id} className="worker-task-item">
                          <div className="worker-task-row">
                            <span className="worker-task-vehicle">{task.vehicle_number}</span>
                            <button
                              className="worker-btn worker-btn-primary"
                              aria-disabled={!canAcceptRequests}
                              title={canAcceptRequests ? "Accept job" : "You are busy or offline"}
                              onClick={() => handleAcceptClick(task.id)}
                            >
                              Accept Job
                            </button>
                          </div>
                          <div className="worker-task-meta">
                            {(() => {
                              const dist = (workerPos && task.user_lat && task.user_lon)
                                ? getDistance(workerPos.lat, workerPos.lng, task.user_lat, task.user_lon)
                                : null;
                              const payout = getWorkerPayout(dist, task.service_type, {
                                basePay: worker?.base_pay_per_order,
                                perKmRate: worker?.per_km_rate,
                                minGuarantee: worker?.minimum_guaranteed_pay
                              });
                              const isFuel = task.service_type === 'petrol' || task.service_type === 'diesel';
                              return (
                                <>
                                  <span style={{ textTransform: 'capitalize' }}>{task.service_type.replace("_", " ")}</span>
                                  {" · "}
                                  {task.payment_method === 'COD' ? (
                                    <>
                                      <span className="premium-accent">Collect: ₹{task.amount}</span>
                                      {" · "}
                                      <span className="premium-success">Payout: ₹{payout.toFixed(0)}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="premium-success">App Payout: ₹{payout.toFixed(0)}</span>
                                      {!isFuel && (
                                        <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '4px', fontWeight: 600, background: 'rgba(251, 191, 36, 0.1)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                          ⚠️ Collect Service Charges
                                        </div>
                                      )}
                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {summaryTab === "History" && (
              <div className="worker-tasks">
                {historyTasks.length === 0 ? (
                  <p className="worker-summary-placeholder">No completed jobs yet.</p>
                ) : (
                  <ul className="worker-tasks-list">
                    {historyTasks.map((task) => (
                      <li key={task.id} className="worker-task-item">
                        <div className="worker-task-row">
                          <span className="worker-task-vehicle">{task.vehicle_number}</span>
                          <span className={`worker-task-status worker-status-${task.status.toLowerCase()}`}>
                            {task.status}
                          </span>
                        </div>
                        <div className="worker-task-meta">
                          {task.service_type.replace("_", " ")} ·
                          {task.status === 'Completed' ? (
                            <span className="premium-success">Payout: ₹{task.worker_payout ?? getWorkerPayout(task.distance_km ? task.distance_km * 1000 : 0, task.service_type, { basePay: worker?.base_pay_per_order, perKmRate: worker?.per_km_rate, minGuarantee: worker?.minimum_guaranteed_pay }).toFixed(0)}</span>
                          ) : (
                            <span>Amount: ₹{task.amount}</span>
                          )}
                          {" · "}
                          {new Date(task.created_at).toLocaleDateString()}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        {showPayoutHistory && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setShowPayoutHistory(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(2, 6, 23, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              padding: '1rem'
            }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '560px',
                maxHeight: '70vh',
                background: '#0f172a',
                border: '1px solid rgba(148, 163, 184, 0.28)',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fff' }}>Payout History</h3>
                  <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>Total received: ₹{totalPayoutsReceived.toFixed(0)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPayoutHistory(false)}
                  style={{ background: 'transparent', color: '#cbd5e1', border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: '8px', padding: '0.3rem 0.55rem', cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>

              <div style={{ overflowY: 'auto', padding: '1rem 1.25rem' }}>
                {payoutHistory.length === 0 ? (
                  <p style={{ margin: 0, color: '#94a3b8' }}>No payouts received yet.</p>
                ) : (
                  payoutHistory.map((payout) => (
                    <div
                      key={payout.id}
                      style={{
                        padding: '0.8rem 0.9rem',
                        background: 'rgba(30, 41, 59, 0.65)',
                        border: '1px solid rgba(148, 163, 184, 0.18)',
                        borderRadius: '10px',
                        marginBottom: '0.65rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'baseline' }}>
                        <span style={{ color: '#4ade80', fontWeight: 700 }}>+₹{Number(payout.amount || 0).toFixed(0)}</span>
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{new Date(payout.created_at).toLocaleString()}</span>
                      </div>
                      {payout.reference_id && (
                        <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.35rem' }}>Ref: {payout.reference_id}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div >
  );
}
