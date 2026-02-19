"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type User = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  role: string;
  created_at: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone_number: "", role: "User", new_password: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const loadUsers = () => {
    fetch("/api/admin/users")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load users");
        return res.json();
      })
      .then((data) => setUsers(data))
      .catch((err) => setError(err.message || "Could not load users."));
  };

  useEffect(() => {
    loadUsers();
    setLoading(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    loadUsers();
  }, [loading]);

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

  const openEdit = (u: User) => {
    setEditUser(u);
    setEditForm({
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      phone_number: u.phone_number,
      role: u.role,
      new_password: "",
    });
    setEditError(null);
  };

  const closeEdit = () => {
    setEditUser(null);
    setEditError(null);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditSaving(true);
    setEditError(null);
    const { new_password, ...payload } = editForm;
    fetch(`/api/admin/users/${editUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(new_password ? { ...payload, new_password } : payload),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data?.error || "Update failed");
        loadUsers();
        closeEdit();
      })
      .catch((err) => setEditError(err.message || "Failed to update"))
      .finally(() => setEditSaving(false));
  };

  const handleDelete = (id: number) => {
    if (id === 1) return;
    setDeleteConfirm(id);
  };

  const confirmDelete = () => {
    if (deleteConfirm == null) return;
    fetch(`/api/admin/users/${deleteConfirm}`, { method: "DELETE" })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data?.error || "Delete failed");
        setUsers((prev) => prev.filter((u) => u.id !== deleteConfirm));
        setDeleteConfirm(null);
      })
      .catch((err) => {
        setError(err.message || "Failed to delete");
        setDeleteConfirm(null);
      });
  };

  const activeTab: string = "Users";
  const normalizedUserSearch = searchQuery.trim().toLowerCase();
  const filteredUsers = users.filter((u) => {
    if (!normalizedUserSearch) return true;
    const haystack = [
      String(u.id),
      u.first_name,
      u.last_name,
      u.email,
      u.phone_number,
      u.role,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedUserSearch);
  });

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-header">
        <h1>Users</h1>
        <p>Manage platform users.</p>
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
            placeholder="Search users by ID, name, email, phone, role..."
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
        {loading && <p className="admin-loading">Loading users...</p>}
        {error && <p className="admin-table-error">{error}</p>}
        {!loading && filteredUsers.length === 0 && !error && (
          <p className="admin-table-empty">No users yet. Users will appear here after they sign up.</p>
        )}
        {!loading && filteredUsers.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.first_name} {u.last_name}</td>
                    <td>{u.email}</td>
                    <td>{u.phone_number}</td>
                    <td><span className={`admin-role-badge admin-role-badge--${u.role.toLowerCase()}`}>{u.role}</span></td>
                    <td>{formatDate(u.created_at)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" className="admin-btn-edit" onClick={() => openEdit(u)}>Edit</button>
                        {u.id === 1 ? (
                          <span className="admin-btn-delete-disabled" title="Cannot delete primary admin (ID 1)">Delete</span>
                        ) : (
                          deleteConfirm === u.id ? (
                            <>
                              <button type="button" className="admin-btn-confirm" onClick={confirmDelete}>Confirm</button>
                              <button type="button" className="admin-btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                            </>
                          ) : (
                            <button type="button" className="admin-btn-delete" onClick={() => handleDelete(u.id)}>Delete</button>
                          )
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

      {editUser && (
        <div className="admin-modal-overlay" onClick={closeEdit}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit user</h2>
            <form onSubmit={handleEditSubmit} className="admin-modal-form">
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
              <div className="admin-modal-row">
                <label>Role</label>
                {editUser?.id === 1 ? (
                  <div className="admin-role-readonly" title="Primary admin (ID 1) role cannot be changed">
                    Admin
                  </div>
                ) : (
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                  >
                    <option value="User">User</option>
                    <option value="Admin">Admin</option>
                  </select>
                )}
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
    </div>
  );
}
