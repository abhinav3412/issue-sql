"use client";

import { useState, useEffect, useCallback, Suspense, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
// import workerAvatar from "../../public/worker-avatar.png";
// import userAvatar from "../../public/user-avatar.png";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useMap } from "react-leaflet";

const AdminMap = dynamic(() => import("./AdminMap"), { ssr: false });

type ActivityItem = {
  type: string;
  message: string;
  created_at?: string;
  first_name?: string;
  last_name?: string;
};

type ServiceRequest = {
  id: number;
  user_id: number | null;
  vehicle_number: string;
  service_type: string;
  phone_number?: string;
  user_lat?: number;
  user_lon?: number;
  status: string;
  created_at: string;
  first_name?: string;
  last_name?: string;
};

type HeatPoint = {
  lat: number;
  lng: number;
  intensity: number;
};

type AnalyticsSeriesPoint = {
  date: string;
  count: number;
};

type EtaSeriesPoint = {
  date: string;
  minutes: number;
};

type Analytics = {
  windowDays: number;
  requestsPerDay: AnalyticsSeriesPoint[];
  codFailuresPerDay: AnalyticsSeriesPoint[];
  avgEtaPerDay: EtaSeriesPoint[];
  avgEtaMinutes: number;
  workerUtilization: { status: string; count: number }[];
  utilizationPercent: number;
};

type WorkerFinancial = {
  id: number;
  first_name: string;
  last_name: string;
  service_type: string;
  current_float: number;
  online_earnings: number;
  cod_earnings: number;
};

type Financials = {
  range: string;
  totalEarnings: number;
  onlineEarnings: number;
  codEarnings: number;
  workerFinancials: WorkerFinancial[];
};

type Stats = {
  totalUsers: number;
  totalWorkers: number;
  activeWorkers: number;
  activeRequests: number;
  recentUsers: { id: number; email: string; first_name: string; last_name: string; created_at?: string }[];
  recentActivity?: ActivityItem[];
  activeWorkersList: { id: number; first_name: string; last_name: string; status: string; latitude?: number; longitude?: number; service_type?: string }[];
  serviceRequests?: ServiceRequest[];
  analytics?: Analytics;
  heatmaps?: { cancellations: HeatPoint[]; failures: HeatPoint[] };
  financials?: Financials;
};

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const UTILIZATION_COLORS: Record<string, string> = {
  Available: "#22c55e",
  Busy: "#f97316",
  Offline: "#64748b",
};

const HEATMAP_GRADIENTS: Record<string, Record<number, string>> = {
  cancellations: {
    0.15: "rgba(251, 146, 60, 0.5)",
    0.5: "rgba(244, 63, 94, 0.7)",
    1.0: "rgba(190, 18, 60, 0.95)",
  },
  failures: {
    0.15: "rgba(251, 191, 36, 0.4)",
    0.5: "rgba(248, 113, 113, 0.7)",
    1.0: "rgba(185, 28, 28, 0.95)",
  },
  connectivity: {
    0.15: "rgba(253, 224, 71, 0.6)",
    0.5: "rgba(249, 115, 22, 0.85)",
    1.0: "rgba(239, 68, 68, 0.95)",
  },
};

function AdminDashboardContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityDate, setActivityDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [chartsReady, setChartsReady] = useState(false);
  const [heatmapLayer, setHeatmapLayer] = useState<"cancellations" | "failures" | "connectivity">("cancellations");
  const [connectivityHeat, setConnectivityHeat] = useState<HeatPoint[]>([]);
  const [connectivityZones, setConnectivityZones] = useState<any | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"daily" | "weekly" | "monthly" | "all">("daily");
  const [platformSettings, setPlatformSettings] = useState<any | null>(null);
  const [payoutsData, setPayoutsData] = useState<any[]>([]);

  const loadPlatformSettings = useCallback(() => {
    fetch("/api/admin/platform-settings")
      .then((res) => res.json())
      .then((data) => setPlatformSettings(data))
      .catch(() => setPlatformSettings(null));
  }, []);

  const [authChecked, setAuthChecked] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams?.get("tab") || "";
  const activeTab: string = ["Analytics", "Payouts"].includes(tabParam) ? tabParam : "Overview";

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("agf_user") : null;
      if (raw) {
        const data = JSON.parse(raw);
        if (data.role !== "Admin") {
          router.push("/login");
          return;
        }
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

  useEffect(() => {
    setChartsReady(true);
  }, []);

  const refreshConnectivity = useCallback(() => {
    fetch("/api/connectivity-heat")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setConnectivityHeat(Array.isArray(data?.points) ? data.points : []))
      .catch(() => setConnectivityHeat([]));

    fetch("/api/connectivity-zones")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setConnectivityZones(data || null))
      .catch(() => setConnectivityZones(null));
  }, []);

  useEffect(() => {
    refreshConnectivity();
    loadPlatformSettings();
  }, [refreshConnectivity, loadPlatformSettings]);

  const loadPayoutsData = useCallback(() => {
    fetch("/api/payouts?summary=true")
      .then((res) => res.json())
      .then((data) => setPayoutsData(Array.isArray(data) ? data : []))
      .catch(() => setPayoutsData([]));
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    const query = new URLSearchParams();
    if (activityDate) query.set("date", activityDate);
    if (analyticsRange) query.set("range", analyticsRange);
    const url = `/api/admin/stats?${query.toString()}`;

    setLoading(true);
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activityDate, analyticsRange, authChecked]);

  useEffect(() => {
    if (activeTab === "Payouts") loadPayoutsData();
  }, [activeTab, loadPayoutsData]);

  const refreshActiveWorkers = () => {
    if (!authChecked) return;
    const query = new URLSearchParams();
    if (activityDate) query.set("date", activityDate);
    if (analyticsRange) query.set("range", analyticsRange);
    const url = `/api/admin/stats?${query.toString()}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setStats((prev) =>
          prev
            ? {
              ...prev,
              activeWorkers: data.activeWorkers ?? prev.activeWorkers,
              activeWorkersList: data.activeWorkersList ?? prev.activeWorkersList,
            }
            : data
        );
      })
      .catch(() => { });
  };

  if (!authChecked) return null;

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="admin-dashboard-header">
          <h1>Admin Dashboard</h1>
          <p>Monitor and manage all platform operations.</p>
        </div>
        <p className="admin-loading">Loading...</p>
      </div>
    );
  }

  const s = stats ?? {
    totalUsers: 0,
    totalWorkers: 0,
    activeWorkers: 0,
    activeRequests: 0,
    recentUsers: [],
    recentActivity: [],
    activeWorkersList: [],
  };

  const analytics: Analytics = s.analytics ?? {
    windowDays: 0,
    requestsPerDay: [],
    codFailuresPerDay: [],
    avgEtaPerDay: [],
    avgEtaMinutes: 0,
    workerUtilization: [],
    utilizationPercent: 0,
  };

  const financials: Financials = s.financials ?? {
    range: "daily",
    totalEarnings: 0,
    onlineEarnings: 0,
    codEarnings: 0,
    workerFinancials: [],
  };

  const heatmaps = s.heatmaps ?? { cancellations: [], failures: [] };

  const formatChartDate = (value: string) => {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length !== 3) return value;
    return `${parts[1]}/${parts[2]}`;
  };

  const chartTooltipStyle = {
    background: "rgba(15, 23, 42, 0.95)",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    borderRadius: "10px",
    color: "#e2e8f0",
  };

  const activeHeatPoints =
    heatmapLayer === "cancellations"
      ? heatmaps.cancellations
      : heatmapLayer === "failures"
        ? heatmaps.failures
        : connectivityHeat;

  const connectivityOverlays =
    heatmapLayer === "connectivity" && connectivityZones
      ? [
        {
          data: connectivityZones,
          style: (feature: any) => {
            const severity = feature?.properties?.severity;
            if (severity === "none") {
              return {
                color: "rgba(239, 68, 68, 0.85)",
                fillColor: "rgba(239, 68, 68, 0.2)",
                weight: 2,
                fillOpacity: 0.35,
              };
            }
            return {
              color: "rgba(245, 158, 11, 0.8)",
              fillColor: "rgba(245, 158, 11, 0.15)",
              weight: 2,
              fillOpacity: 0.25,
            };
          },
        },
      ]
      : [];

  const connectivityZoneCount = Array.isArray(connectivityZones?.features)
    ? connectivityZones.features.length
    : 0;

  const heatmapMeta = {
    cancellations: {
      title: "Cancellation hotspots",
      description: "Clusters where users frequently cancel requests before dispatch completes.",
      count: heatmaps.cancellations.length,
    },
    failures: {
      title: "COD failure zones",
      description: "Cash-on-delivery failures concentrated by request location.",
      count: heatmaps.failures.length,
    },
    connectivity: {
      title: "Poor connectivity clusters",
      description: "Crowdsourced weak or offline network zones impacting fulfillment.",
      count: connectivityZoneCount,
    },
  };

  const activeHeatMeta = heatmapMeta[heatmapLayer];
  const codFailuresTotal = analytics.codFailuresPerDay.reduce((sum, item) => sum + item.count, 0);
  const requestsTotal = analytics.requestsPerDay.reduce((sum, item) => sum + item.count, 0);

  const heatmapActions: Record<string, string> = {
    cancellations: "Pre-position crews near repeat cancellation clusters and tighten dispatch SLAs.",
    failures: "Audit COD eligibility and station coverage in repeated failure pockets.",
    connectivity: "Reroute workers around low-signal zones and enable offline handoff playbooks.",
  };
  const activeHeatAction = heatmapActions[heatmapLayer];

  const formatActivityTime = (raw: string | undefined) => {
    if (!raw) return "—";
    try {
      // API returns server local time as "YYYY-MM-DD HH:MM:SS". Parse as local so the displayed time matches when the action happened (e.g. 10 PM).
      const s = raw.trim().replace(" ", "T");
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return "—";
      // Format as dd/mm/yy (e.g. 30/01/26)
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = String(d.getFullYear()).slice(-2);
      return `${day}/${month}/${year}`;
    } catch {
      return "—";
    }
  };

  const activityIcon = (type: string) => {
    const workerIcon = (
      <img className="admin-activity-avatar" src="/worker-avatar.png" alt="Worker" />
    );
    const userIcon = (
      <img className="admin-activity-avatar" src="/user-avatar.png" alt="User" />
    );
    const icons: Record<string, ReactNode> = {
      user_registered: userIcon,
      worker_created: workerIcon,
      worker_deleted: workerIcon,
      user_deleted: userIcon,
      user_updated: userIcon,
      worker_updated: workerIcon,
      fuel_station_added: "?",
      fuel_station_deleted: "???"
    };
    return <span className="admin-activity-dot">{icons[type] || "?"}</span>;
  };

  const monthName = calendarMonth.toLocaleString("default", { month: "long" });
  const monthYear = calendarMonth.getFullYear();
  const firstOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const lastOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
  const startPad = firstOfMonth.getDay();
  const daysInMonth = lastOfMonth.getDate();
  const prevMonth = () => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1));
  const nextMonth = () => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1));
  const calendarDays: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const downloadCsv = () => {
    if (!financials.workerFinancials.length) return;

    const headers = ["Worker ID", "Name", "Service Type", "Online Earnings", "Floating Earnings", "Current Float"];
    const rows = financials.workerFinancials.map((w) => [
      w.id,
      `"${w.first_name} ${w.last_name}"`,
      w.service_type || "",
      w.online_earnings,
      w.cod_earnings,
      w.current_float,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `worker_financials_${analyticsRange}_${toYMD(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-header">
        <h1>Admin Dashboard</h1>
        <p>Monitor and manage all platform operations.</p>
      </div>

      {/* Tabs */}
      <nav className="admin-tabs">
        <Link href="/admin" className={`admin-tab ${activeTab === "Overview" ? "admin-tab--active" : ""}`}>
          Overview
        </Link>
        <Link href="/admin/workers" className={`admin-tab ${activeTab === "Workers" ? "admin-tab--active" : ""}`}>
          Workers
        </Link>
        <Link href="/admin/users" className={`admin-tab ${activeTab === "Users" ? "admin-tab--active" : ""}`}>
          Users
        </Link>
        <Link href="/admin/service-requests" className={`admin-tab ${activeTab === "Service Requests" ? "admin-tab--active" : ""}`}>
          Service Requests
        </Link>
        <Link href="/admin/fuel-stations" className={`admin-tab ${activeTab === "Fuel Stations" ? "admin-tab--active" : ""}`}>
          Fuel Stations
        </Link>
        <Link href="/admin?tab=Analytics" className={`admin-tab ${activeTab === "Analytics" ? "admin-tab--active" : ""}`}>
          Analytics
        </Link>
        <Link href="/admin/cod" className={`admin-tab ${activeTab === "COD Controls" ? "admin-tab--active" : ""}`}>
          COD Controls
        </Link>
        <Link href="/admin/payouts" className={`admin-tab ${activeTab === "Payouts" ? "admin-tab--active" : ""}`}>
          Worker Payouts
        </Link>
        <Link href="/admin/fuel-station-payouts" className={`admin-tab ${activeTab === "Station Payouts" ? "admin-tab--active" : ""}`}>
          Station Payouts
        </Link>
      </nav>

      {activeTab === "Overview" && (
        <>
          {/* Live Operations Map */}
          <section className="admin-section admin-map-section">
            <div className="admin-section-header">
              <div>
                <h2>Live Operations Map</h2>
                <p>Real-time tracking of all active workers and service requests.</p>
              </div>
              <div className="admin-map-controls">
                <span className="admin-pill">• {s.activeWorkers} Workers Active</span>
                <button type="button" className="admin-btn admin-btn-secondary" onClick={refreshActiveWorkers}>
                  Refresh
                </button>
              </div>
            </div>
            <div className="admin-map-layout">
              <div className="admin-map-container">
                <AdminMap
                  serviceRequests={s.serviceRequests}
                  workers={s.activeWorkersList}
                  showRequests={false}
                />
              </div>
              <div className="admin-workers-panel">
                <h3>Active Workers ({s.activeWorkersList.length})</h3>
                <ul className="admin-workers-list">
                  {s.activeWorkersList.length === 0 ? (
                    <li className="admin-worker-item">No workers yet</li>
                  ) : (
                    s.activeWorkersList.map((w) => (
                      <li key={w.id} className="admin-worker-item">
                        <span className="admin-worker-dot" />
                        <span>
                          {w.first_name} {w.last_name}
                        </span>
                        <span className="admin-worker-meta">{w.status}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </section>

          {/* Recent Service Requests Section */}
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Recent Service Requests</h2>
              <Link href="/admin/service-requests" className="admin-link">View All</Link>
            </div>
            <div className="admin-requests-grid">
              {(!s.serviceRequests || s.serviceRequests.length === 0) ? (
                <p className="admin-placeholder">No recent requests</p>
              ) : (
                s.serviceRequests.slice(0, 4).map((req) => (
                  <div key={req.id} className="admin-request-card">
                    <div className="admin-request-header">
                      <div>
                        <p className="admin-request-vehicle">{req.vehicle_number}</p>
                        <p className="admin-request-user">
                          {req.first_name && req.last_name ? `${req.first_name} ${req.last_name}` : "Anonymous"}
                        </p>
                      </div>
                      <span className={`admin-request-status admin-request-status--${req.status.toLowerCase().replace(" ", "-")}`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="admin-request-meta">
                      <span>{req.service_type}</span>
                      <span>{req.phone_number || "-"}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* KPIs */}
          <section className="admin-kpis">
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Total Users</span>
              <span className="admin-kpi-value">{s.totalUsers.toLocaleString()}</span>
              <span className="admin-kpi-meta">registered</span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Active Workers</span>
              <span className="admin-kpi-value">{s.activeWorkers}</span>
              <span className="admin-kpi-meta">of {s.totalWorkers} total</span>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Active Requests</span>
              <span className="admin-kpi-value">{s.activeRequests}</span>
              <span className="admin-kpi-meta">—</span>
            </div>
          </section>

        </>
      )}

      {activeTab === "Analytics" && (
        <>
          {/* Surge & Weather Mission Control */}
          <section className="admin-section" style={{ marginBottom: "2rem" }}>
            <div className="admin-section-header">
              <div>
                <h2>Surge & Weather Mission Control</h2>
                <p>Real-time status and manual overrides for dynamic pricing.</p>
              </div>
            </div>
            <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>Night Surge</h3>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>9:00 PM - 6:00 AM (Auto)</p>
                  </div>
                  <div style={{ padding: '0.4rem 0.8rem', background: (new Date().getHours() >= 21 || new Date().getHours() < 6) ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '999px', border: '1px solid currentColor', color: (new Date().getHours() >= 21 || new Date().getHours() < 6) ? '#22c55e' : '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
                    {(new Date().getHours() >= 21 || new Date().getHours() < 6) ? '🌙 Active' : '☀️ Standby'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>Rainy Condition</h3>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>Manual override for surge</p>
                  </div>
                  <button
                    onClick={async () => {
                      const isNowRaining = platformSettings?.is_raining ? 0 : 1;
                      await fetch("/api/admin/platform-settings", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...platformSettings, is_raining: isNowRaining }),
                      });
                      loadPlatformSettings();
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      backgroundColor: platformSettings?.is_raining ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      transition: 'all 0.2s'
                    }}
                  >
                    {platformSettings?.is_raining ? '🌧️ Raining' : '☀️ Clear'}
                  </button>
                </div>
              </div>
            </div>
          </section>
          {/* Financials Section */}
          <section className="admin-section admin-analytics-section" style={{ marginBottom: "2rem" }}>
            <div className="admin-section-header admin-analytics-header">
              <div>
                <h2>Financial Overview</h2>
                <p>Track earnings from Online payments and Cash-on-Delivery (Floating Cash).</p>
              </div>
              <div className="admin-intel-actions">
                <button
                  type="button"
                  className={`admin-intel-tab ${analyticsRange === "daily" ? "admin-intel-tab--active" : ""}`}
                  onClick={() => setAnalyticsRange("daily")}
                >
                  Daily
                </button>
                <button
                  type="button"
                  className={`admin-intel-tab ${analyticsRange === "weekly" ? "admin-intel-tab--active" : ""}`}
                  onClick={() => setAnalyticsRange("weekly")}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  className={`admin-intel-tab ${analyticsRange === "monthly" ? "admin-intel-tab--active" : ""}`}
                  onClick={() => setAnalyticsRange("monthly")}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={`admin-intel-tab ${analyticsRange === "all" ? "admin-intel-tab--active" : ""}`}
                  onClick={() => setAnalyticsRange("all")}
                >
                  All Time
                </button>
              </div>
            </div>

            <div className="admin-kpis" style={{ marginBottom: "2rem" }}>
              <div className="admin-kpi-card">
                <span className="admin-kpi-label">Total Earnings</span>
                <span className="admin-kpi-value">{financials.totalEarnings.toLocaleString()}</span>
                <span className="admin-kpi-meta">{analyticsRange} period</span>
              </div>
              <div className="admin-kpi-card">
                <span className="admin-kpi-label">Online Earnings</span>
                <span className="admin-kpi-value" style={{ color: "#22c55e" }}>{financials.onlineEarnings.toLocaleString()}</span>
                <span className="admin-kpi-meta">Bank transferred</span>
              </div>
              <div className="admin-kpi-card">
                <span className="admin-kpi-label">Floating Cash</span>
                <span className="admin-kpi-value" style={{ color: "#f97316" }}>{financials.codEarnings.toLocaleString()}</span>
                <span className="admin-kpi-meta">Collected by workers</span>
              </div>
            </div>

            <div className="admin-chart-card" style={{ height: "auto", minHeight: "300px" }}>
              <div className="admin-chart-header">
                <div>
                  <h3>Worker Financials</h3>
                  <p>Earnings breakdown per worker for the selected period.</p>
                </div>
                <button type="button" className="admin-btn admin-btn-secondary" onClick={downloadCsv} disabled={!financials.workerFinancials.length}>
                  Download CSV
                </button>
              </div>
              <div className="admin-chart-body" style={{ padding: "1rem" }}>
                <div style={{ overflowX: "auto" }}>
                  <table className="admin-requests-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", fontSize: "0.875rem" }}>
                        <th style={{ padding: "0.75rem" }}>Worker</th>
                        <th style={{ padding: "0.75rem" }}>Service</th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>Online Earnings</th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>Floating Earnings</th>
                        <th style={{ padding: "0.75rem", textAlign: "right" }}>Current Float (Debt)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financials.workerFinancials.map((w) => (
                        <tr key={w.id} style={{ borderBottom: "1px solid #1e293b", color: "#e2e8f0" }}>
                          <td style={{ padding: "0.75rem" }}>
                            <div style={{ fontWeight: 500 }}>{w.first_name} {w.last_name}</div>
                          </td>
                          <td style={{ padding: "0.75rem" }}>{w.service_type || "-"}</td>
                          <td style={{ padding: "0.75rem", textAlign: "right", color: "#22c55e" }}>
                            {w.online_earnings.toLocaleString()}
                          </td>
                          <td style={{ padding: "0.75rem", textAlign: "right", color: "#f97316" }}>
                            {w.cod_earnings.toLocaleString()}
                          </td>
                          <td style={{ padding: "0.75rem", textAlign: "right" }}>
                            <span style={{
                              padding: "0.25rem 0.5rem",
                              borderRadius: "9999px",
                              background: w.current_float > 1000 ? "rgba(244, 63, 94, 0.2)" : "rgba(148, 163, 184, 0.1)",
                              color: w.current_float > 1000 ? "#f43f5e" : "#e2e8f0",
                              fontSize: "0.875rem"
                            }}>
                              {w.current_float.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {financials.workerFinancials.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                            No worker data for this period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* Admin Analytics Dashboard */}
          <section className="admin-section admin-analytics-section">
            <div className="admin-section-header admin-analytics-header">
              <div>
                <h2>Admin Analytics Dashboard</h2>
                <p>Requests, COD risk, ETA health, and workforce utilization.</p>
              </div>
              <span className="admin-analytics-window">
                {analytics.windowDays ? `Last ${analytics.windowDays} days` : "Recent window"}
              </span>
            </div>
            <div className="admin-analytics-grid">
              <div className="admin-chart-card">
                <div className="admin-chart-header">
                  <div>
                    <h3>Requests per Day</h3>
                    <p>Daily demand signal across the platform.</p>
                  </div>
                </div>
                <div className="admin-chart-body">
                  {chartsReady ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.requestsPerDay}>
                        <defs>
                          <linearGradient id="requestsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.6} />
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                        <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="#94a3b8" />
                        <YAxis allowDecimals={false} stroke="#94a3b8" />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelFormatter={(label) => `Date: ${formatChartDate(String(label))}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          fill="url(#requestsGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="skeleton admin-chart-skeleton" />
                  )}
                </div>
              </div>

              <div className="admin-chart-card">
                <div className="admin-chart-header">
                  <div>
                    <h3>COD Failures</h3>
                    <p>Failed cash-on-delivery collections by day.</p>
                  </div>
                  <span className="admin-chart-meta">{codFailuresTotal} failures</span>
                </div>
                <div className="admin-chart-body">
                  {chartsReady ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.codFailuresPerDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                        <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="#94a3b8" />
                        <YAxis allowDecimals={false} stroke="#94a3b8" />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelFormatter={(label) => `Date: ${formatChartDate(String(label))}`}
                        />
                        <Bar dataKey="count" fill="#f97316" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="skeleton admin-chart-skeleton" />
                  )}
                </div>
              </div>

              <div className="admin-chart-card">
                <div className="admin-chart-header">
                  <div>
                    <h3>Average ETA</h3>
                    <p>Minutes from request creation to completion.</p>
                  </div>
                  <span className="admin-chart-meta">
                    {analytics.avgEtaMinutes ? `${analytics.avgEtaMinutes} min` : "No completions"}
                  </span>
                </div>
                <div className="admin-chart-body">
                  {chartsReady ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics.avgEtaPerDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                        <XAxis dataKey="date" tickFormatter={formatChartDate} stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelFormatter={(label) => `Date: ${formatChartDate(String(label))}`}
                          formatter={(value) => [`${value} min`, "Avg ETA"]}
                        />
                        <Line type="monotone" dataKey="minutes" stroke="#22c55e" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="skeleton admin-chart-skeleton" />
                  )}
                </div>
              </div>

              <div className="admin-chart-card admin-chart-card--utilization">
                <div className="admin-chart-header">
                  <div>
                    <h3>Worker Utilization</h3>
                    <p>Live distribution of workforce states.</p>
                  </div>
                  <span className="admin-chart-meta">{analytics.utilizationPercent}% busy</span>
                </div>
                <div className="admin-chart-body admin-chart-body--split">
                  <div className="admin-utilization-chart">
                    {chartsReady ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.workerUtilization}
                            dataKey="count"
                            nameKey="status"
                            innerRadius="60%"
                            outerRadius="80%"
                            paddingAngle={5}
                          >
                            {analytics.workerUtilization.map((entry) => (
                              <Cell key={`cell-${entry.status}`} fill={UTILIZATION_COLORS[entry.status] || "#64748b"} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={chartTooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="skeleton admin-chart-skeleton" />
                    )}
                  </div>
                  <div className="admin-utilization-legend">
                    {analytics.workerUtilization.length === 0 ? (
                      <p className="admin-placeholder">No worker data</p>
                    ) : (
                      analytics.workerUtilization.map((entry) => (
                        <div key={entry.status} className="admin-utilization-row">
                          <span
                            className="admin-utilization-dot"
                            style={{ background: UTILIZATION_COLORS[entry.status] || "#64748b" }}
                          />
                          <span className="admin-utilization-label">{entry.status}</span>
                          <span className="admin-utilization-value">{entry.count}</span>
                        </div>
                      ))
                    )}
                    <div className="admin-utilization-summary">
                      <span>Utilization</span>
                      <strong>{analytics.utilizationPercent}%</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Heatmap Intelligence */}
          <section className="admin-section admin-intel-section">
            <div className="admin-section-header admin-intel-header">
              <div>
                <h2>Heatmap Intelligence</h2>
                <p>Cancellation hotspots, COD failure zones, and connectivity drag.</p>
              </div>
              <div className="admin-intel-actions">
                <button
                  type="button"
                  className={`admin-intel-tab ${heatmapLayer === "cancellations" ? "admin-intel-tab--active" : ""}`}
                  onClick={() => setHeatmapLayer("cancellations")}
                >
                  Cancellation hotspots
                </button>
                <button
                  type="button"
                  className={`admin-intel-tab ${heatmapLayer === "failures" ? "admin-intel-tab--active" : ""}`}
                  onClick={() => setHeatmapLayer("failures")}
                >
                  COD failure zones
                </button>
                <button
                  type="button"
                  className={`admin-intel-tab ${heatmapLayer === "connectivity" ? "admin-intel-tab--active" : ""}`}
                  onClick={() => setHeatmapLayer("connectivity")}
                >
                  Poor connectivity
                </button>
                <button type="button" className="admin-btn admin-btn-secondary admin-intel-refresh" onClick={refreshConnectivity}>
                  Refresh telemetry
                </button>
              </div>
            </div>
            <div className="admin-intel-grid">
              <div className="admin-intel-map">
                <AdminMap
                  showRequests={false}
                  workers={[]}
                  serviceRequests={[]}
                  wrapClassName="admin-leaflet-wrap admin-intel-leaflet-wrap"
                  mapClassName="admin-leaflet-map admin-intel-leaflet-map"
                  geoJsonOverlays={connectivityOverlays}
                >
                  <HeatmapOverlay points={activeHeatPoints} gradient={HEATMAP_GRADIENTS[heatmapLayer]} />
                </AdminMap>
              </div>
              <div className="admin-intel-panel">
                <div className="admin-intel-card">
                  <span className="admin-intel-label">Active layer</span>
                  <h3>{activeHeatMeta.title}</h3>
                  <p>{activeHeatMeta.description}</p>
                </div>
                <div className="admin-intel-metrics">
                  <div className="admin-intel-metric">
                    <span>Signals</span>
                    <strong>{activeHeatMeta.count}</strong>
                  </div>
                  <div className="admin-intel-metric">
                    <span>Requests</span>
                    <strong>{requestsTotal}</strong>
                  </div>
                  <div className="admin-intel-metric">
                    <span>COD failures</span>
                    <strong>{codFailuresTotal}</strong>
                  </div>
                </div>
                <div className="admin-intel-note">
                  <span className="admin-intel-label">Suggested action</span>
                  <p>{activeHeatAction}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Service Price Settings */}
          <section className="admin-section">
            <ServicePriceSettings />
          </section>

          {/* Settlement Algorithm Calculator */}
          <section className="admin-section" style={{ marginTop: '2rem' }}>
            <div className="admin-section-header">
              <div>
                <h2>💰 Settlement Algorithm (Fuel)</h2>
                <p>Live calculator showing how payments are distributed between customer, fuel station, worker, and platform for fuel services.</p>
              </div>
            </div>
            <SettlementCalculator />
          </section>
        </>
      )}

      {activeTab === "Payouts" && (
        <section className="admin-section">
          <div className="admin-section-header">
            <div>
              <h2>Worker Payouts & Settlements</h2>
              <p>Manage worker balances and record settlements.</p>
            </div>
            <button className="admin-btn admin-btn-secondary" onClick={loadPayoutsData}>Refresh</button>
          </div>

          <div className="admin-chart-card" style={{ height: "auto" }}>
            <div className="admin-chart-body" style={{ padding: "0" }}>
              <table className="admin-requests-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", fontSize: "0.85rem", textAlign: "left" }}>
                    <th style={{ padding: "1rem" }}>Worker</th>
                    <th style={{ padding: "1rem" }}>Service</th>
                    <th style={{ padding: "1rem", textAlign: "right" }}>Lifetime Earnings</th>
                    <th style={{ padding: "1rem", textAlign: "right" }}>Total Paid</th>
                    <th style={{ padding: "1rem", textAlign: "right" }}>Balance Due</th>
                    <th style={{ padding: "1rem", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutsData.map((w) => {
                    const balance = w.lifetime_earnings - w.total_paid;
                    return (
                      <tr key={w.id} style={{ borderBottom: "1px solid #1e293b", color: "#e2e8f0" }}>
                        <td style={{ padding: "1rem" }}>
                          <div style={{ fontWeight: 600 }}>{w.first_name} {w.last_name}</div>
                          <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{w.phone_number}</div>
                        </td>
                        <td style={{ padding: "1rem" }}>{w.service_type}</td>
                        <td style={{ padding: "1rem", textAlign: "right", color: "#22c55e" }}>₹{w.lifetime_earnings.toLocaleString()}</td>
                        <td style={{ padding: "1rem", textAlign: "right", color: "#94a3b8" }}>₹{w.total_paid.toLocaleString()}</td>
                        <td style={{ padding: "1rem", textAlign: "right", fontWeight: 700, color: balance > 0 ? "#f59e0b" : "#e2e8f0" }}>
                          ₹{balance.toLocaleString()}
                        </td>
                        <td style={{ padding: "1rem", textAlign: "center" }}>
                          {balance > 0 ? (
                            <button
                              className="admin-btn admin-btn-primary"
                              style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
                              onClick={async () => {
                                const amount = prompt(`Enter settlement amount for ${w.first_name} (Max: ${balance})`, balance.toString());
                                if (amount && !isNaN(Number(amount))) {
                                  const val = Number(amount);
                                  if (val <= 0) return alert("Invalid amount");

                                  const ref = prompt("Enter Reference ID (UPI/Bank Ref):", `PAY-${Date.now()}`);

                                  try {
                                    const res = await fetch("/api/payouts", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        worker_id: w.id,
                                        amount: val,
                                        reference_id: ref,
                                        notes: "Admin manual settlement"
                                      })
                                    });
                                    if (res.ok) {
                                      alert("Settlement recorded successfully!");
                                      loadPayoutsData();
                                    } else {
                                      alert("Failed to record settlement.");
                                    }
                                  } catch (e) {
                                    alert("Error processing request.");
                                  }
                                }
                              }}
                            >
                              Settle
                            </button>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Settled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {payoutsData.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>No worker data available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {
        activeTab === "Overview" && (
          <>
            {/* Recent Activity */}
            <section className="admin-section">
              <div className="admin-activity-header">
                <h2>Recent Activity</h2>
                {activityDate && (
                  <button type="button" className="admin-btn admin-btn-secondary admin-activity-show-all" onClick={() => setActivityDate(null)}>
                    Show all recent
                  </button>
                )}
              </div>
              <div className="admin-activity-with-calendar">
                <div className="admin-activity-calendar">
                  <div className="admin-calendar-nav">
                    <button type="button" className="admin-calendar-nav-btn" onClick={prevMonth} aria-label="Previous month">
                      ‹
                    </button>
                    <span className="admin-calendar-title">
                      {monthName} {monthYear}
                    </span>
                    <button type="button" className="admin-calendar-nav-btn" onClick={nextMonth} aria-label="Next month">
                      ›
                    </button>
                  </div>
                  <div className="admin-calendar-weekdays">
                    <span>Sun</span>
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                  </div>
                  <div className="admin-calendar-grid">
                    {calendarDays.map((day, idx) => {
                      if (day === null) return <div key={`pad-${idx}`} className="admin-calendar-day admin-calendar-day--empty" />;
                      const dateStr = toYMD(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                      const isSelected = activityDate === dateStr;
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`admin-calendar-day ${isSelected ? "admin-calendar-day--selected" : ""}`}
                          onClick={() => setActivityDate(dateStr)}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  {activityDate && (
                    <p className="admin-calendar-selected-label">
                      Showing activity for {[activityDate.slice(8, 10), Number(activityDate.slice(5, 7)), activityDate.slice(2, 4)].join("/")}
                    </p>
                  )}
                </div>
                <div className="admin-activity-list-wrap">
                  {activityDate && (
                    <p className="admin-activity-date-label">
                      Activity for {[activityDate.slice(8, 10), Number(activityDate.slice(5, 7)), activityDate.slice(2, 4)].join("/")}
                    </p>
                  )}
                  <ul className="admin-activity-list">
                    {loading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="skeleton" style={{ height: '3.5rem' }}></div>
                        <div className="skeleton" style={{ height: '3.5rem' }}></div>
                        <div className="skeleton" style={{ height: '3.5rem' }}></div>
                      </div>
                    ) : (!s.recentActivity || s.recentActivity.length === 0) ? (
                      <li className="admin-activity-item">No recent activity</li>
                    ) : (
                      s.recentActivity.map((item, i) => (
                        <li key={`${item.type}-${item.created_at}-${i}`} className="premium-item" style={{ marginBottom: '0.75rem' }}>
                          <div className="premium-item-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {activityIcon(item.type)}
                              <span className="premium-item-title">
                                {item.type.replace(/_/g, " ").toUpperCase()}
                              </span>
                            </div>
                            <span className="dash-date-pill">{formatActivityTime(item.created_at)}</span>
                          </div>
                          <div className="premium-item-meta" style={{ color: '#e2e8f0' }}>
                            {item.message}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </section>
          </>
        )
      }
    </div >
  );
}

function HeatmapOverlay({ points, gradient }: { points: HeatPoint[]; gradient: Record<number, string> }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (!points.length) return;
    let heat: any = null;
    let handleZoom: (() => void) | null = null;
    let cancelled = false;

    const radiusForZoom = (zoom: number) => {
      if (zoom <= 9) return 50;
      if (zoom <= 11) return 42;
      if (zoom <= 13) return 34;
      return 26;
    };

    const loadHeat = async () => {
      const leaflet = await import("leaflet");
      await import("leaflet.heat");
      if (cancelled) return;
      const L = (leaflet as any).default ?? leaflet;
      const data = points.map((p) => [p.lat, p.lng, p.intensity]);

      heat = (L as any).heatLayer(data, {
        radius: radiusForZoom(map.getZoom()),
        blur: 20,
        maxZoom: 15,
        minOpacity: 0.35,
        gradient,
      }).addTo(map);

      // Optimize canvas for frequent readback operations
      const canvas = heat._canvas as HTMLCanvasElement | undefined;
      if (canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = canvas.width; // Reinitialize canvas with optimized context
        }
      }

      handleZoom = () => {
        if (!map.hasLayer(heat)) return;
        heat.setOptions({ radius: radiusForZoom(map.getZoom()) });
      };

      map.on("zoomend", handleZoom);
    };

    loadHeat();

    return () => {
      cancelled = true;
      if (handleZoom) map.off("zoomend", handleZoom);
      if (heat && map.hasLayer(heat)) map.removeLayer(heat);
    };
  }, [map, points, gradient]);

  return null;
}

function ServicePriceSettings() {
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/service-prices")
      .then((res) => res.json())
      .then((data) => {
        setPrices(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handlePriceChange = (type: string, amount: number) => {
    setPrices((prev) =>
      prev.map((p) => (p.service_type === type ? { ...p, amount } : p))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/service-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices }),
      });
      if (res.ok) {
        setMessage("Settings saved successfully!");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("Failed to save settings.");
      }
    } catch {
      setMessage("Error saving settings.");
    }
    setSaving(false);
  };

  if (loading) return <div className="admin-loading">Loading settings...</div>;

  return (
    <div className="admin-chart-card" style={{ height: "auto", marginBottom: "2rem" }}>
      <div className="admin-chart-header">
        <div>
          <h3>Service Estimation Settings</h3>
          <p>Configure base amounts for non-fuel services.</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
      <div className="admin-chart-body" style={{ padding: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
          {prices.filter((p) => p.service_type !== "petrol" && p.service_type !== "diesel").map((p) => (
            <div key={p.service_type}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "#94a3b8", marginBottom: "0.5rem", textTransform: "capitalize" }}>
                {p.service_type.replace("_", " ")} (₹)
              </label>
              <input
                type="number"
                value={p.amount}
                onChange={(e) => handlePriceChange(p.service_type, parseInt(e.target.value) || 0)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#e2e8f0",
                }}
              />
            </div>
          ))}
        </div>
        {message && (
          <p style={{ marginTop: "1rem", color: message.includes("success") ? "#22c55e" : "#ef4444", fontSize: "0.875rem", fontWeight: 500 }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function SettlementCalculator() {
  const [litres, setLitres] = useState(5);
  const [fuelType, setFuelType] = useState<'petrol' | 'diesel'>('petrol');
  const [distanceKm, setDistanceKm] = useState(5);
  const [isNight, setIsNight] = useState(false);
  const [isRain, setIsRain] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({
    petrol: 107.48,
    diesel: 96.48,
  });

  useEffect(() => {
    fetch("/api/fuel-prices")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.petrol && data.diesel) {
          setFuelPrices({ petrol: data.petrol, diesel: data.diesel });
        }
      })
      .catch(() => { });
  }, []);

  const pricePerLitre = fuelPrices[fuelType];

  // Calculate settlement (Swiggy Logic: Adjust fees to cover guarantee)
  const fuelCost = Math.round(litres * pricePerLitre);

  // 1. Initial Fees
  let deliveryFee = 80;
  const platformServiceFee = Math.round(fuelCost * 0.05);

  // 2. Small Order Surcharge (Swiggy Logic)
  const smallOrderSurcharge = litres < 5 ? 35 : 0;

  // 3. Surge
  let surgeMultiplier = 1.0;
  const surgeReasons: string[] = [];
  if (isNight) { surgeMultiplier *= 1.5; surgeReasons.push('Night'); }
  if (isRain) { surgeMultiplier *= 1.3; surgeReasons.push('Rain'); }
  if (isEmergency) { surgeMultiplier *= 2.0; surgeReasons.push('Emergency'); }
  const surgeFee = surgeMultiplier > 1 ? Math.round(deliveryFee * (surgeMultiplier - 1)) : 0;

  // 4. Worker payment (No longer capped)
  const basePay = 50;
  const distancePay = distanceKm * 10;
  const workerSurgeBonus = Math.round(surgeFee * 0.5);
  let peakHourBonus = 0;
  if (isNight || isEmergency) {
    peakHourBonus = Math.round((basePay + distancePay) * 0.2);
  }
  const longDistanceBonus = distanceKm >= 15 ? 100 : 0;
  let workerTotal = basePay + distancePay + workerSurgeBonus + peakHourBonus + longDistanceBonus;
  const minimumPay = 100;
  if (workerTotal < minimumPay) workerTotal = minimumPay;

  // 5. Margin Protection (Adjust Customer Delivery Fee)
  const currentServiceRevenue = deliveryFee + platformServiceFee + surgeFee + smallOrderSurcharge;
  const targetRevenue = workerTotal + 15; // Worker pay + Platform profit margin (₹15)
  if (currentServiceRevenue < targetRevenue) {
    deliveryFee += (targetRevenue - currentServiceRevenue);
  }

  const customerTotal = fuelCost + deliveryFee + platformServiceFee + surgeFee + smallOrderSurcharge;
  const fuelStationPayout = fuelCost;
  const platformProfit = customerTotal - fuelStationPayout - workerTotal;
  const platformMargin = customerTotal > 0 ? ((platformProfit / customerTotal) * 100) : 0;
  const marginHealthy = platformProfit > 0 && platformMargin >= 10;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
    border: '1px solid #334155', background: 'rgba(15, 23, 42, 0.8)',
    color: '#e2e8f0', fontSize: '0.875rem'
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', color: '#94a3b8',
    marginBottom: '0.25rem', fontWeight: 500
  };
  const checkStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.5rem 0.75rem', borderRadius: '8px',
    border: '1px solid #334155', background: 'rgba(15, 23, 42, 0.5)',
    cursor: 'pointer', fontSize: '0.85rem', color: '#e2e8f0'
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      {/* Inputs */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.6)', borderRadius: '12px',
        padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.15)'
      }}>
        <h3 style={{ color: '#e2e8f0', fontSize: '1rem', margin: '0 0 1rem', fontWeight: 600 }}>⚙️ Order Parameters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Fuel Type</label>
            <select value={fuelType} onChange={(e) => setFuelType(e.target.value as 'petrol' | 'diesel')} style={inputStyle}>
              <option value="petrol">Petrol ({fuelPrices.petrol}/L)</option>
              <option value="diesel">Diesel ({fuelPrices.diesel}/L)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Litres ({litres}L)</label>
            <input type="range" min={1} max={20} value={litres} onChange={(e) => setLitres(+e.target.value)}
              style={{ ...inputStyle, accentColor: '#2563eb', padding: '0.75rem 0' }} />
          </div>
          <div>
            <label style={labelStyle}>Distance ({distanceKm} km)</label>
            <input type="range" min={1} max={30} value={distanceKm} onChange={(e) => setDistanceKm(+e.target.value)}
              style={{ ...inputStyle, accentColor: '#22c55e', padding: '0.75rem 0' }} />
          </div>
          <div>
            <label style={labelStyle}>Conditions</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ ...checkStyle, borderColor: isNight ? '#6366f1' : '#334155' }}>
                <input type="checkbox" checked={isNight} onChange={(e) => setIsNight(e.target.checked)} />
                🌙 Night (1.5x)
              </label>
              <label style={{ ...checkStyle, borderColor: isRain ? '#0ea5e9' : '#334155' }}>
                <input type="checkbox" checked={isRain} onChange={(e) => setIsRain(e.target.checked)} />
                🌧️ Rain (1.3x)
              </label>
              <label style={{ ...checkStyle, borderColor: isEmergency ? '#ef4444' : '#334155' }}>
                <input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} />
                🚨 Emergency (2.0x)
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.6)', borderRadius: '12px',
        padding: '1.25rem', border: '1px solid rgba(148, 163, 184, 0.15)'
      }}>
        <h3 style={{ color: '#e2e8f0', fontSize: '1rem', margin: '0 0 1rem', fontWeight: 600 }}>📊 Settlement Breakdown</h3>

        {/* Customer Bill */}
        <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.1)', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#60a5fa', marginBottom: '0.5rem' }}>👤 Customer Bill</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.25rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
            <span>Fuel ({litres}L × {pricePerLitre})</span><span style={{ textAlign: 'right' }}>{fuelCost}</span>
            <span>Delivery Fee</span><span style={{ textAlign: 'right' }}>{deliveryFee - (litres < 5 ? 35 : 0)}</span>
            <span>Platform Fee (5%)</span><span style={{ textAlign: 'right' }}>{platformServiceFee}</span>
            {litres < 5 && (<><span>Small Order Surcharge</span><span style={{ textAlign: 'right' }}>+35</span></>)}
            {surgeFee > 0 && (<><span style={{ color: '#f59e0b' }}>Surge ({surgeReasons.join('+')})</span><span style={{ textAlign: 'right', color: '#f59e0b' }}>+{surgeFee}</span></>)}
          </div>
          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#e2e8f0' }}>
            <span>Total</span><span>{customerTotal}</span>
          </div>
        </div>

        {/* Distribution */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
          <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: 600, marginBottom: '0.25rem' }}>⛽ Fuel Station</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fbbf24' }}>{fuelStationPayout}</div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>100% fuel cost</div>
          </div>
          <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 600, marginBottom: '0.25rem' }}>👷 Worker</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#4ade80' }}>{workerTotal}</div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Base + distance + bonuses</div>
          </div>
          <div style={{ padding: '0.75rem', borderRadius: '8px', background: marginHealthy ? 'rgba(99, 102, 241, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${marginHealthy ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`, textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: marginHealthy ? '#818cf8' : '#f87171', fontWeight: 600, marginBottom: '0.25rem' }}>🏢 Platform</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: marginHealthy ? '#818cf8' : '#f87171' }}>{platformProfit}</div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{platformMargin.toFixed(1)}% margin</div>
          </div>
        </div>

        {/* Margin Status */}
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: '8px',
          background: marginHealthy ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${marginHealthy ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          fontSize: '0.75rem',
          color: marginHealthy ? '#4ade80' : '#f87171',
          textAlign: 'center',
          fontWeight: 600
        }}>
          {marginHealthy
            ? `✅ Healthy margin: ${platformMargin.toFixed(1)}% (target ≥ 10%)`
            : `⚠️ Low margin: ${platformMargin.toFixed(1)}% — consider adjusting fees`}
        </div>

        {/* Worker Payout Breakdown */}
        <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', fontSize: '0.72rem', color: '#64748b' }}>
          <strong style={{ color: '#94a3b8' }}>Worker breakdown:</strong> Base {basePay} + Distance {distancePay} ({distanceKm}km × {10})
          {workerSurgeBonus > 0 && <> + Surge {workerSurgeBonus}</>}
          {peakHourBonus > 0 && <> + Peak {peakHourBonus}</>}
          {longDistanceBonus > 0 && <> + Long-dist {longDistanceBonus}</>}
          {basePay + distancePay + workerSurgeBonus + peakHourBonus + longDistanceBonus < minimumPay && <> (min guarantee applied)</>}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={<div className="admin-loading">Loading...</div>}>
      <AdminDashboardContent />
    </Suspense>
  );
}
