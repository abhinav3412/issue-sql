"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useNotification } from "@/app/NotificationSystem";

type ServiceRequest = {
  id: number;
  user_id: number | null;
  vehicle_number: string;
  service_type: string;
  amount?: number;
  phone_number?: string;
  user_lat?: number;
  user_lon?: number;
  status: string;
  created_at: string;
  assigned_at?: string;
  in_progress_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  assigned_worker?: number | null;
  first_name?: string;
  last_name?: string;
  worker_first_name?: string;
  worker_last_name?: string;
  worker_phone?: string;
  worker_status?: string;
  worker_latitude?: number;
  worker_longitude?: number;
  payment_method?: string;
  payment_status?: string;
  payment_id?: string;
};

export default function AdminServiceRequestsPage() {
  const { showToast, showConfirm } = useNotification();
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [updating, setUpdating] = useState<number | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);

  const distanceKm = (aLat?: number, aLon?: number, bLat?: number, bLon?: number) => {
    if (
      aLat == null ||
      aLon == null ||
      bLat == null ||
      bLon == null
    ) {
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
  };

  const formatDateTime = (raw?: string) => {
    if (!raw) return "—";
    const d = new Date(String(raw).trim().replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  useEffect(() => {
    loadServiceRequests();
  }, []);

  const loadServiceRequests = () => {
    setLoading(true);
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => {
        setServiceRequests(data.serviceRequests || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const handleCancelRequest = async (id: number) => {
    const confirmed = await showConfirm("Are you sure you want to cancel this service request?");
    if (!confirmed) return;
    setUpdating(id);
    fetch(`/api/service-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Cancelled" }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data?.error || "Failed to update status");
        showToast("Service request cancelled successfully", "success");
        loadServiceRequests();
      })
      .catch((err) => showToast("Failed to cancel request: " + (err.message || err), "error"))
      .finally(() => setUpdating(null));
  };

  const statusFilteredRequests =
    filterStatus === "All"
      ? serviceRequests
      : serviceRequests.filter((r) => r.status === filterStatus);
  const normalizedRequestSearch = searchQuery.trim().toLowerCase();
  const filteredRequests = statusFilteredRequests.filter((r) => {
    if (!normalizedRequestSearch) return true;
    const haystack = [
      String(r.id),
      String(r.user_id ?? ""),
      r.vehicle_number,
      r.service_type,
      r.status,
      r.phone_number || "",
      r.first_name || "",
      r.last_name || "",
      r.worker_first_name || "",
      r.worker_last_name || "",
      r.worker_phone || "",
      r.payment_method || "",
      r.payment_status || "",
      r.payment_id || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedRequestSearch);
  });

  const activeTab: string = "Service Requests";

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-header">
        <h1>Service Requests</h1>
        <p>View and manage all service requests from all users.</p>
      </div>
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

      <section className="admin-section">
        <div className="admin-section-header">
          <h2>All Service Requests</h2>
          <div className="admin-filter-buttons">
            {["All", "Pending", "Assigned", "In Progress", "Completed", "Cancelled"].map((status) => (
              <button
                key={status}
                type="button"
                className={`admin-filter-btn ${filterStatus === status ? "admin-filter-btn--active" : ""}`}
                onClick={() => setFilterStatus(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="text"
            placeholder="Search requests by ID, vehicle, user, worker, phone, payment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              maxWidth: "560px",
              padding: "0.6rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
            }}
          />
        </div>

        {loading ? (
          <p className="admin-placeholder">Loading...</p>
        ) : filteredRequests.length === 0 ? (
          <p className="admin-placeholder">No service requests found</p>
        ) : (
          <div className="admin-requests-grid">
            {filteredRequests.map((req) => (
              <div
                key={req.id}
                className="admin-request-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRequest(req)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedRequest(req);
                  }
                }}
              >
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
                  <span>
                    {(() => {
                      const d = new Date(req.created_at);
                      const day = String(d.getDate()).padStart(2, "0");
                      const month = String(d.getMonth() + 1).padStart(2, "0");
                      const year = String(d.getFullYear()).slice(-2);
                      return `${day}/${month}/${year}`;
                    })()}
                  </span>
                </div>
                {req.status !== "Completed" && req.status !== "Cancelled" && (
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="admin-request-cancel-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelRequest(req.id);
                      }}
                      disabled={updating === req.id}
                    >
                      {updating === req.id ? "Cancelling..." : "Cancel Request"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedRequest && (
        <div
          className="admin-modal-overlay"
          role="presentation"
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className="admin-modal"
            role="dialog"
            aria-labelledby="admin-request-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admin-request-modal-title">Request Progress</h2>
            <div className="admin-modal-form">
              <div className="admin-modal-grid">
                <div className="admin-modal-col">
                  <div className="admin-modal-section-title">User Info</div>
                  <div className="admin-modal-row">
                    <label>User</label>
                    <div>
                      {selectedRequest.first_name && selectedRequest.last_name
                        ? `${selectedRequest.first_name} ${selectedRequest.last_name}`
                        : "Anonymous"}
                    </div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Phone</label>
                    <div>{selectedRequest.phone_number || "N/A"}</div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Vehicle</label>
                    <div>{selectedRequest.vehicle_number}</div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Service</label>
                    <div>{selectedRequest.service_type}</div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Payment</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontWeight: 'bold' }}>{selectedRequest.amount != null ? `${selectedRequest.amount}` : "—"}</span>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Method: {selectedRequest.payment_method || "ONLINE"}
                      </span>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: selectedRequest.payment_status === 'PAID' ? '#f0fdf4' : '#fff7ed',
                        color: selectedRequest.payment_status === 'PAID' ? '#166534' : '#9a3412',
                        width: 'fit-content'
                      }}>
                        {selectedRequest.payment_status || "PAID"}
                      </span>
                      {selectedRequest.payment_id && (
                        <span style={{ fontSize: '0.7rem', color: '#64748b', wordBreak: 'break-all' }}>
                          ID: {selectedRequest.payment_id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="admin-modal-col">
                  <div className="admin-modal-section-title">Worker Info</div>
                  <div className="admin-modal-row">
                    <label>Assigned Worker</label>
                    <div>
                      {selectedRequest.worker_first_name && selectedRequest.worker_last_name
                        ? `${selectedRequest.worker_first_name} ${selectedRequest.worker_last_name}`
                        : "—"}
                    </div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Worker Status</label>
                    <div>{selectedRequest.worker_status || "—"}</div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Worker Phone</label>
                    <div>{selectedRequest.worker_phone || "—"}</div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Worker Distance</label>
                    <div>
                      {(() => {
                        const d = distanceKm(
                          selectedRequest.user_lat,
                          selectedRequest.user_lon,
                          selectedRequest.worker_latitude,
                          selectedRequest.worker_longitude
                        );
                        return d != null ? `${d.toFixed(2)} km` : "—";
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-modal-divider" />

              <div className="admin-modal-grid">
                <div className="admin-modal-col">
                  <div className="admin-modal-section-title">Status</div>
                  <div className="admin-modal-row">
                    <label>Current Status</label>
                    <div>{selectedRequest.status}</div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Created</label>
                    <div>{formatDateTime(selectedRequest.created_at)}</div>
                  </div>
                </div>
                <div className="admin-modal-col">
                  <div className="admin-modal-section-title">Timeline</div>
                  <div className="admin-modal-row">
                    <label>Assigned</label>
                    <div>{formatDateTime(selectedRequest.assigned_at)}</div>
                  </div>
                  <div className="admin-modal-row">
                    <label>In Progress</label>
                    <div>{formatDateTime(selectedRequest.in_progress_at)}</div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Completed</label>
                    <div>{formatDateTime(selectedRequest.completed_at)}</div>
                  </div>
                  <div className="admin-modal-row">
                    <label>Cancelled</label>
                    <div>{formatDateTime(selectedRequest.cancelled_at)}</div>
                  </div>
                </div>
              </div>

              <div className="admin-modal-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setSelectedRequest(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
