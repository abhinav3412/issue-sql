"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const ROLES = ["Delivery", "Crane", "Mechanic Bike", "Mechanic Car"];

export default function WorkerProfilePage() {
    const [worker, setWorker] = useState<{
        id: number;
        first_name: string;
        last_name: string;
        phone_number: string;
        service_type: string;
        status: string;
        status_locked: number;
        verified?: number;
        floater_cash?: number;
    } | null>(null);
    const [bankDetails, setBankDetails] = useState<{
        account_holder_name: string;
        account_number: string;
        ifsc_code: string;
        bank_name: string;
        is_bank_verified: number;
        rejection_reason?: string;
    } | null>(null);
    const [bankForm, setBankForm] = useState({
        account_holder_name: '',
        account_number: '',
        ifsc_code: '',
        bank_name: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const fetchWorkerData = async () => {
            try {
                const raw = localStorage.getItem("agf_user");
                if (!raw) return;
                const data = JSON.parse(raw);
                const res = await fetch(`/api/workers?id=${data.id}`);
                if (res.ok) {
                    const workerData = await res.json();
                    setWorker(workerData);
                }
            } catch (err) {
                console.error("Failed to fetch worker", err);
            } finally {
                setLoading(false);
            }
        };

        const fetchBankDetails = async () => {
            try {
                const res = await fetch("/api/worker/bank-details", {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('agf_token')}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.bank_details) {
                        setBankDetails(data.bank_details);
                    }
                } else if (res.status === 401) {
                    setMessage("Session expired or invalid. Please logout and login again to access bank details.");
                }
            } catch (err) {
                console.error("Failed to fetch bank details", err);
            }
        };

        fetchWorkerData();
        fetchBankDetails();
    }, []);

    const handleBankSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage("");
        try {
            const res = await fetch("/api/worker/bank-details", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    'Authorization': `Bearer ${localStorage.getItem('agf_token')}`
                },
                body: JSON.stringify(bankForm),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage("Bank details submitted for verification!");
                setBankDetails({
                    ...bankForm,
                    is_bank_verified: 0,
                    account_number: 'XXXXXX' + bankForm.account_number.slice(-4),
                    ifsc_code: 'XXXXXX' + bankForm.ifsc_code.slice(-4)
                });
            } else {
                setMessage(data.error || "Failed to submit bank details.");
            }
        } catch (err) {
            setMessage("Error submitting bank details.");
        } finally {
            setSaving(false);
        }
    };

    const handleRoleChange = async (role: string) => {
        if (!worker) return;
        setSaving(true);
        setMessage("");
        try {
            const res = await fetch("/api/workers", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: worker.id, service_type: role }),
            });
            if (res.ok) {
                setWorker({ ...worker, service_type: role });
                setMessage("Role updated successfully!");
            } else {
                const data = await res.json();
                setMessage(data.error || "Failed to update role.");
            }
        } catch (err) {
            setMessage("Error updating role.");
        } finally {
            setSaving(false);
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        if (!worker) return;
        if (worker.status_locked) {
            setMessage("Your status is locked by Admin. Please contact support.");
            return;
        }
        setSaving(true);
        setMessage("");
        try {
            const res = await fetch("/api/workers", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: worker.id, status: newStatus }),
            });
            if (res.ok) {
                setWorker({ ...worker, status: newStatus });
                setMessage(`Status updated to ${newStatus}!`);
            } else {
                const data = await res.json();
                setMessage(data.error || "Failed to update status.");
            }
        } catch (err) {
            setMessage("Error updating status.");
        } finally {
            setSaving(false);
        }
    };

    const STATUS_OPTIONS = [
        { label: "Available", value: "Available", icon: "🟢", color: "#16a34a" },
        { label: "Busy", value: "Busy", icon: "🟡", color: "#ca8a04" },
        { label: "Offline", value: "Offline", icon: "⚪", color: "#64748b" },
    ];

    if (loading) return <div className="worker-loading">Loading Profile...</div>;
    if (!worker) return <div className="worker-error">Worker not found. Please log in again.</div>;

    return (
        <div className="worker-profile-container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
            <div className="premium-breadcrumb">
                <Link href="/worker" className="back-link" style={{ textDecoration: 'none' }}>
                    ← Dashboard
                </Link>
                <span>/ profile-settings</span>
            </div>

            <div className="worker-profile-card">
                {worker.status_locked === 1 && (
                    <div style={{ backgroundColor: '#fff7ed', borderLeft: '4px solid #f97316', padding: '0.75rem 1rem', marginBottom: '1.5rem', borderRadius: '4px' }}>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#9a3412', fontWeight: 500 }}>
                            🔒 <strong>Account Status Locked:</strong>
                            {(worker.floater_cash || 0) >= 1500
                                ? ` Your floater cash (₹${worker.floater_cash?.toFixed(2)}) has reached the limit. Please pay Admin to unlock.`
                                : " Your availability status has been managed by an administrator."}
                        </p>
                    </div>
                )}

                <div className="worker-profile-header">
                    <div className="worker-avatar-large">
                        {(worker.first_name?.[0] || "W").toUpperCase()}
                    </div>
                    <div className="worker-profile-info">
                        <h2>{worker.first_name} {worker.last_name}</h2>
                        <p className="worker-welcome-subtitle">Manage your service role and availability</p>
                    </div>
                </div>

                <div className="worker-section">
                    <h3 className="worker-section-title">Current Availability</h3>
                    <div className="worker-status-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '1rem' }}>
                        {STATUS_OPTIONS.map((opt) => {
                            const isActive = worker.status === opt.value;
                            const isDisabled = saving || (worker.status_locked === 1);
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleStatusChange(opt.value)}
                                    disabled={isDisabled}
                                    style={{
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        border: `2px solid ${isActive ? opt.color : '#e2e8f0'}`,
                                        backgroundColor: isActive ? `${opt.color}10` : '#fff',
                                        color: isActive ? opt.color : '#64748b',
                                        fontWeight: 600,
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        opacity: isDisabled && !isActive ? 0.6 : 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <span style={{ fontSize: '1.25rem' }}>{opt.icon}</span>
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="worker-section" style={{ marginTop: '2.5rem' }}>
                    <h3 className="worker-section-title">Select Service Role</h3>
                    <p className="worker-section-subtitle">Choose the type of service you provide. You will only receive requests matching this role.</p>

                    <div className="worker-role-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
                        {ROLES.map((role) => (
                            <button
                                key={role}
                                className={`worker-action-card ${worker.service_type === role ? 'worker-action-primary' : ''}`}
                                onClick={() => handleRoleChange(role)}
                                disabled={saving}
                                style={{ textAlign: 'center', justifyContent: 'center', height: '140px' }}
                            >
                                <span className="worker-action-icon">
                                    {role === "Delivery" && "⛽"}
                                    {role === "Crane" && "🏗️"}
                                    {role === "Mechanic Bike" && "🏍️"}
                                    {role === "Mechanic Car" && "🚗"}
                                </span>
                                <span className="worker-action-title">{role}</span>
                                <span className="worker-action-desc" style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '2px' }}>
                                    {role === "Delivery" && "Petrol & Diesel Delivery"}
                                    {role === "Crane" && "Vehicle Towing Service"}
                                    {role === "Mechanic Bike" && "Bike Repair & Service"}
                                    {role === "Mechanic Car" && "Car Repair & Service"}
                                </span>
                                {worker.service_type === role && <span className="worker-action-desc" style={{ fontWeight: 700, marginTop: '5px' }}>Selected</span>}
                            </button>
                        ))}
                    </div>
                </div>
                {message && <div style={{
                    marginTop: '1.5rem',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    backgroundColor: message.toLowerCase().includes('success') || message.toLowerCase().includes('updated') ? '#f0fdf4' : '#fef2f2',
                    color: message.toLowerCase().includes('success') || message.toLowerCase().includes('updated') ? '#166534' : '#991b1b',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    textAlign: 'center'
                }}>{message}</div>}

                <div className="worker-section" style={{ marginTop: '2.5rem' }}>
                    <h3 className="worker-section-title">Bank Details for Payouts</h3>
                    {bankDetails && bankDetails.is_bank_verified === 1 ? (
                        <div style={{ padding: '1.5rem', background: '#00000070', borderRadius: '12px', border: '1px solid #dcfce7' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>ACCOUNT HOLDER</label>
                                    <p style={{ margin: 0, fontWeight: 500 }}>{bankDetails.account_holder_name}</p>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>BANK NAME</label>
                                    <p style={{ margin: 0, fontWeight: 500 }}>{bankDetails.bank_name}</p>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>ACCOUNT NUMBER</label>
                                    <p style={{ margin: 0, fontWeight: 500 }}>{bankDetails.account_number}</p>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>VERIFICATION</label>
                                    <p style={{ margin: 0, color: '#16a34a', fontWeight: 'bold' }}>✓ Verified</p>
                                </div>
                            </div>
                        </div>
                    ) : bankDetails && bankDetails.is_bank_verified === 0 ? (
                        <div style={{ padding: '1.5rem', background: '#fffbeb', borderRadius: '12px', border: '1px solid #fef3c7' }}>
                            <p style={{ margin: 0, color: '#92400e', fontSize: '0.9rem' }}>
                                ⏳ <strong>Verification Pending:</strong> Your bank details are being reviewed by the admin.
                            </p>
                            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', opacity: 0.7 }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>ACCOUNT NUMBER</label>
                                    <p style={{ margin: 0 }}>{bankDetails.account_number}</p>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>BANK</label>
                                    <p style={{ margin: 0 }}>{bankDetails.bank_name}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleBankSubmit} style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {bankDetails && bankDetails.is_bank_verified === 2 && (
                                <div style={{ padding: '0.75rem', background: '#fef2f2', borderLeft: '4px solid #ef4444', color: '#991b1b', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                                    ❌ <strong>Rejected:</strong> {bankDetails.rejection_reason || 'Please check and resubmit.'}
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="admin-modal-row">
                                    <label>Account Holder Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={bankForm.account_holder_name}
                                        onChange={e => setBankForm({ ...bankForm, account_holder_name: e.target.value })}
                                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                                    />
                                </div>
                                <div className="admin-modal-row">
                                    <label>Bank Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={bankForm.bank_name}
                                        onChange={e => setBankForm({ ...bankForm, bank_name: e.target.value })}
                                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="admin-modal-row">
                                    <label>Account Number</label>
                                    <input
                                        type="text"
                                        required
                                        value={bankForm.account_number}
                                        onChange={e => setBankForm({ ...bankForm, account_number: e.target.value })}
                                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                                    />
                                </div>
                                <div className="admin-modal-row">
                                    <label>IFSC Code</label>
                                    <input
                                        type="text"
                                        required
                                        value={bankForm.ifsc_code}
                                        onChange={e => setBankForm({ ...bankForm, ifsc_code: e.target.value })}
                                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    padding: '0.75rem',
                                    background: '#0f172a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                }}
                            >
                                {saving ? 'Submitting...' : 'Submit Bank Details'}
                            </button>
                        </form>
                    )}
                </div>

                <div className="worker-details-grid" style={{ marginTop: '2rem', borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem' }}>
                    <div className="detail-item">
                        <label>Phone Number</label>
                        <p>{worker.phone_number}</p>
                    </div>
                    <div className="detail-item">
                        <label>Identity Verified</label>
                        {worker.verified ? (
                            <p style={{ color: '#16a34a' }}>✓ Verified</p>
                        ) : (
                            <p style={{ color: '#b91c1c' }}>? Unverified</p>
                        )}
                    </div>
                    <div className="detail-item">
                        <label>Pending Floater Cash</label>
                        <p style={{ fontWeight: 'bold', color: (worker.floater_cash || 0) >= 1500 ? '#ef4444' : 'inherit' }}>
                            {worker.floater_cash?.toFixed(2) || "0.00"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
