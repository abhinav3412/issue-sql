"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CodSettings = {
  cod_limit: number;
  trust_threshold: number;
  max_failures: number;
  disable_days: number;
};

type CodUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  trust_score: number;
  cod_success_count: number;
  cod_failure_count: number;
  cod_last_failure_reason?: string;
  cod_disabled?: number;
  cod_disabled_until?: string;
};

export default function AdminCodPage() {
  const [settings, setSettings] = useState<CodSettings | null>(null);
  const [users, setUsers] = useState<CodUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const loadSettings = () => {
    fetch("/api/admin/cod-settings")
      .then((res) => res.json())
      .then((data) => setSettings(data))
      .catch(() => setSettings(null));
  };

  const loadUsers = () => {
    setLoadingUsers(true);
    fetch("/api/admin/cod-users")
      .then((res) => res.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  };

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  const updateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/cod-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save");
      loadSettings();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const toggleUserCod = async (userId: number, disabled: boolean) => {
    await fetch("/api/admin/cod-users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, cod_disabled: disabled }),
    });
    loadUsers();
  };

  const resetUserCod = async (userId: number) => {
    await fetch("/api/admin/cod-users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, reset_counts: true }),
    });
    loadUsers();
  };

  const activeTab: string = "COD Controls";

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-header">
        <h1>COD Controls</h1>
        <p>Manage Cash on Delivery eligibility, limits, and user trust.</p>
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
          <h2>Eligibility Settings</h2>
        </div>
        {settings ? (
          <form className="admin-cod-form" onSubmit={updateSettings}>
            <div className="admin-cod-grid">
              <label>
                COD Limit (?)
                <input
                  type="number"
                  value={settings.cod_limit}
                  onChange={(e) => setSettings({ ...settings, cod_limit: Number(e.target.value) })}
                />
              </label>
              <label>
                Trust Threshold
                <input
                  type="number"
                  value={settings.trust_threshold}
                  onChange={(e) => setSettings({ ...settings, trust_threshold: Number(e.target.value) })}
                />
              </label>
              <label>
                Max COD Failures
                <input
                  type="number"
                  value={settings.max_failures}
                  onChange={(e) => setSettings({ ...settings, max_failures: Number(e.target.value) })}
                />
              </label>
              <label>
                Disable Days
                <input
                  type="number"
                  value={settings.disable_days}
                  onChange={(e) => setSettings({ ...settings, disable_days: Number(e.target.value) })}
                />
              </label>
            </div>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </form>
        ) : (
          <p className="admin-placeholder">Loading settings...</p>
        )}
      </section>


      <section className="admin-section">
        <div className="admin-section-header">
          <h2>Users with COD History</h2>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={loadUsers}>
            Refresh
          </button>
        </div>
        {loadingUsers ? (
          <p className="admin-placeholder">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="admin-placeholder">No users found</p>
        ) : (
          <div className="admin-cod-users">
            {users.map((u) => (
              <div key={u.id} className="admin-cod-user-card">
                <div>
                  <strong>{u.first_name} {u.last_name}</strong>
                  <div className="admin-cod-user-meta">{u.email}</div>
                  <div className="admin-cod-user-meta">Trust: {u.trust_score ?? 0}</div>
                  <div className="admin-cod-user-meta">COD Success: {u.cod_success_count ?? 0} · Fail: {u.cod_failure_count ?? 0}</div>
                  <div className="admin-cod-user-meta">Last Failure: {u.cod_last_failure_reason || "—"}</div>
                </div>
                <div className="admin-cod-user-actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    onClick={() => toggleUserCod(u.id, !(u.cod_disabled === 1))}
                  >
                    {u.cod_disabled === 1 ? "Enable COD" : "Disable COD"}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    onClick={() => resetUserCod(u.id)}
                  >
                    Reset Counts
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
