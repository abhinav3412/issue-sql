"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useNotification } from "@/app/NotificationSystem";

type Worker = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  status: string;
  status_locked: number;
  verified?: number;
  floater_cash?: number;
  last_cash_collection_at?: string;
  created_at: string;
  avg_rating?: number;
  lock_reason?: string;
  license_photo?: string;
  self_photo?: string;
};

export default function AdminWorkersPage() {
  const { showToast, showConfirm } = useNotification();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    status: "Available",
    status_locked: false,
    verified: false,
    new_password: "",
  });
  const [workerReviews, setWorkerReviews] = useState<{ id: number; rating: number; review_comment: string; completed_at: string }[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // ... loadWorkers and useEffects ...
  const loadWorkers = () => {
    fetch("/api/admin/workers")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load workers");
        return res.json();
      })
      .then((data) => setWorkers(data))
      .catch((err) => setError(err.message || "Could not load workers."));
  };

  useEffect(() => {
    loadWorkers();
    setLoading(false);
  }, []);

  const formatDate = (raw: string | undefined) => {
    if (!raw) return "—";
    try {
      const d = new Date(raw.trim().replace(" ", "T"));
      if (Number.isNaN(d.getTime())) return "—";
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = String(d.getFullYear()).slice(-2);
      return `${day}/${month}/${year}`;
    } catch {
      return raw;
    }
  };

  const openEdit = (w: Worker) => {
    setEditWorker(w);
    setEditForm({
      first_name: w.first_name,
      last_name: w.last_name,
      email: w.email,
      phone_number: w.phone_number,
      status: w.status,
      status_locked: !!w.status_locked,
      verified: !!w.verified,
      new_password: "",
    });
    setEditError(null);
    fetchReviews(w.id);

    // Fetch full details including photos
    fetch(`/api/admin/workers/${w.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.id) {
          setEditWorker(prev => prev?.id === data.id ? { ...prev, ...data } : prev);
        }
      })
      .catch(err => console.error("Failed to fetch full worker details", err));
  };

  const fetchReviews = (workerId: number) => {
    setLoadingReviews(true);
    fetch(`/api/admin/workers/${workerId}/reviews`)
      .then(res => res.json())
      .then(data => {
        setWorkerReviews(Array.isArray(data) ? data : []);
        setLoadingReviews(false);
      })
      .catch(() => setLoadingReviews(false));
  };

  // ... rest of the component ...
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const closeEdit = () => {
    setEditWorker(null);
    setEditError(null);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editWorker) return;
    setEditSaving(true);
    setEditError(null);
    const { new_password, ...payload } = editForm;
    fetch(`/api/admin/workers/${editWorker.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(new_password ? { ...payload, new_password } : payload),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data?.error || "Update failed");
        loadWorkers();
        closeEdit();
      })
      .catch((err) => setEditError(err.message || "Failed to update"))
      .finally(() => setEditSaving(false));
  };

  const handleDelete = (id: number) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = () => {
    if (deleteConfirm == null) return;
    fetch(`/api/admin/workers/${deleteConfirm}`, { method: "DELETE" })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data?.error || "Delete failed");
        setWorkers((prev) => prev.filter((w) => w.id !== deleteConfirm));
        setDeleteConfirm(null);
      })
      .catch((err) => {
        setError(err.message || "Failed to delete");
        setDeleteConfirm(null);
      });
  };

  const handleCollectCash = async (workerId: number) => {
    const confirmed = await showConfirm("Are you sure you have collected all cash from this worker? This will reset their floater cash to 0 and unlock their status if it was locked.");
    if (!confirmed) return;

    fetch("/api/admin/workers/collect-cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker_id: workerId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          loadWorkers();
          showToast("Cash collection recorded successfully.", "success");
        } else {
          showToast(data.error || "Failed to record cash collection.", "error");
        }
      })
      .catch((err) => showToast("Error: " + err.message, "error"));
  };

  const handleReverify = async () => {
    if (!editWorker) return;
    const confirmed = await showConfirm(`Are you sure you want to request re-verification for ${editWorker.first_name}? This will clear their current documents and reset their verified status.`);
    if (!confirmed) return;

    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/workers/${editWorker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reverify: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset verification");

      showToast("Verification reset. Worker can now upload new documents.", "success");
      setEditWorker(null);
      loadWorkers();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setEditSaving(false);
    }
  };

  const statusClass = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "available") return "admin-status-badge--available";
    if (s === "busy") return "admin-status-badge--busy";
    if (s === "offline") return "admin-status-badge--offline";
    return "admin-status-badge--available";
  };

  const activeTab: string = "Workers";
  const normalizedWorkerSearch = searchQuery.trim().toLowerCase();
  const filteredWorkers = workers.filter((w) => {
    if (!normalizedWorkerSearch) return true;
    const haystack = [
      String(w.id),
      w.first_name,
      w.last_name,
      w.email,
      w.phone_number,
      w.status,
      w.lock_reason || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedWorkerSearch);
  });

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-header">
        <h1>Workers</h1>
        <p>Manage workers and their status.</p>
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
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="text"
            placeholder="Search workers by ID, name, email, phone, status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              maxWidth: "520px",
              padding: "0.6rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.04)",
              color: "white",
            }}
          />
        </div>
        {loading && <p className="admin-loading">Loading workers...</p>}
        {error && <p className="admin-table-error">{error}</p>}
        {!loading && filteredWorkers.length === 0 && !error && (
          <p className="admin-table-empty">No workers yet. Workers will appear here when added.</p>
        )}
        {!loading && filteredWorkers.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Floater Cash</th>
                  <th>Rating</th>
                  <th>Lock</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkers.map((w) => (
                  <tr key={w.id}>
                    <td>{w.id}</td>
                    <td>{w.first_name} {w.last_name}</td>
                    <td>{w.email}</td>
                    <td>
                      <span className={`admin-status-badge ${statusClass(w.status)}`}>{w.status}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 'bold', color: (w.floater_cash || 0) >= 1500 ? '#ff4d4f' : 'inherit' }}>
                          {w.floater_cash?.toFixed(2) || "0.00"}
                        </span>
                        {(w.floater_cash || 0) > 0 && (
                          <button
                            onClick={() => handleCollectCash(w.id)}
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              background: '#1890ff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            Collect
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      {w.avg_rating ? (
                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>★ {w.avg_rating.toFixed(1)}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td>
                      {w.status_locked ? (
                        <span title={w.lock_reason || "Locked by Admin"} style={{ cursor: 'help' }}>🔒</span>
                      ) : (
                        <span title="Unlocked" style={{ cursor: 'help', opacity: 0.3 }}>🔓</span>
                      )}
                    </td>
                    <td>{formatDate(w.created_at)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" className="admin-btn-edit" onClick={() => openEdit(w)}>Edit</button>
                        {deleteConfirm === w.id ? (
                          <>
                            <button type="button" className="admin-btn-confirm" onClick={confirmDelete}>Confirm</button>
                            <button type="button" className="admin-btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                          </>
                        ) : (
                          <button type="button" className="admin-btn-delete" onClick={() => handleDelete(w.id)}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editWorker && (
        <div className="admin-modal-overlay" onClick={closeEdit}>
          <div className="admin-modal" style={{ maxWidth: '900px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h2>Edit worker</h2>
            <form onSubmit={handleEditSubmit} className="admin-modal-form">
              <div style={{ display: 'flex', gap: '2rem' }}>
                {/* Left Column: Worker Details */}
                <div style={{ flex: 1 }}>
                  <div className="admin-modal-row">
                    <label>First name</label>
                    <input
                      value={editForm.first_name}
                      onChange={(e) => setEditForm((p) => ({ ...p, first_name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="admin-modal-row">
                    <label>Last name</label>
                    <input
                      value={editForm.last_name}
                      onChange={(e) => setEditForm((p) => ({ ...p, last_name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="admin-modal-row">
                    <label>Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="admin-modal-row">
                    <label>Phone</label>
                    <input
                      value={editForm.phone_number}
                      onChange={(e) => setEditForm((p) => ({ ...p, phone_number: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="admin-modal-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <label>Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                      style={{ width: '100%' }}
                    >
                      <option value="Available">Available</option>
                      <option value="Busy">Busy</option>
                      <option value="Offline">Offline</option>
                    </select>
                    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                      <input
                        type="checkbox"
                        id="status_locked"
                        checked={editForm.status_locked}
                        onChange={(e) => setEditForm((p) => ({ ...p, status_locked: e.target.checked }))}
                        style={{ width: 'auto', cursor: 'pointer' }}
                      />
                      <label htmlFor="status_locked" style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', color: '#cbd5f5' }}>Lock Status (Worker cannot change it)</label>
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                      <input
                        type="checkbox"
                        id="verified"
                        checked={editForm.verified}
                        onChange={(e) => setEditForm((p) => ({ ...p, verified: e.target.checked }))}
                        style={{ width: 'auto', cursor: 'pointer' }}
                      />
                      <label htmlFor="verified" style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', color: '#cbd5f5' }}>Identity Verified</label>
                    </div>
                  </div>
                  <div className="admin-modal-row">
                    <label>New password (leave blank to keep current)</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={editForm.new_password}
                      onChange={(e) => setEditForm((p) => ({ ...p, new_password: e.target.value }))}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                {/* Right Column: Reviews & Documents */}
                <div style={{ flex: 1, borderLeft: '1px solid rgba(255, 255, 255, 0.1)', paddingLeft: '2rem' }}>
                  <h3 style={{ marginTop: 0, color: '#ffffff' }}>Recent Reviews</h3>
                  {loadingReviews ? (
                    <p style={{ color: '#94a3b8' }}>Loading reviews...</p>
                  ) : workerReviews.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>No reviews yet.</p>
                  ) : (
                    <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem', paddingRight: '0.5rem' }}>
                      {workerReviews.map((r) => (
                        <div key={r.id} style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '14px' }}>{'★'.repeat(r.rating)}</span>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>{formatDate(r.completed_at)}</span>
                          </div>
                          {r.review_comment && (
                            <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', fontStyle: 'italic', lineHeight: '1.4' }}>"{r.review_comment}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Documents Section */}
                  <div style={{ marginTop: '2.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '2rem' }}>
                    <h3 style={{ marginTop: 0, color: '#ffffff' }}>Verification Documents</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>Driving License</label>
                        {editWorker?.license_photo ? (
                          <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0,0,0,0.2)' }}>
                            <img
                              src={editWorker.license_photo}
                              alt="License"
                              style={{ width: '100%', height: '140px', objectFit: 'cover', cursor: 'pointer', transition: 'transform 0.3s' }}
                              onClick={() => setPreviewImage(editWorker.license_photo!)}
                            />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center' }}>Click to view</div>
                          </div>
                        ) : (
                          <div style={{ height: '140px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.85rem' }}>No document</div>
                        )}
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>Selfie Photo</label>
                        {editWorker?.self_photo ? (
                          <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0,0,0,0.2)' }}>
                            <img
                              src={editWorker.self_photo}
                              alt="Selfie"
                              style={{ width: '100%', height: '140px', objectFit: 'cover', cursor: 'pointer', transition: 'transform 0.3s' }}
                              onClick={() => setPreviewImage(editWorker.self_photo!)}
                            />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center' }}>Click to view</div>
                          </div>
                        ) : (
                          <div style={{ height: '140px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px dashed rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.85rem' }}>No photo</div>
                        )}
                      </div>
                    </div>

                    {(editWorker?.license_photo || editWorker?.self_photo) && (
                      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={handleReverify}
                          disabled={editSaving}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '8px',
                            color: '#ef4444',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                          }}
                        >
                          <span style={{ fontSize: '1.1rem' }}>↺</span>
                          Request Re-verification
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {editError && <p className="admin-table-error">{editError}</p>}
              <div className="admin-modal-actions">
                <button type="button" className="admin-btn-cancel" onClick={closeEdit}>Cancel</button>
                <button type="submit" className="admin-btn-save" disabled={editSaving}>
                  {editSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {previewImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '2rem',
            backdropFilter: 'blur(8px)'
          }}
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            style={{
              position: 'absolute',
              top: '2rem',
              right: '2rem',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
          <img
            src={previewImage}
            alt="Full Preview"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 0 50px rgba(0,0,0,0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
