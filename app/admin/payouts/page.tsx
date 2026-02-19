"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAuthHeaders } from "@/app/utils/authGuard";
import { useNotification } from "@/app/NotificationSystem";

type PayoutWorker = {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    pending_balance: number;
    is_bank_verified: number;
    last_payout_at?: string;
};

export default function AdminPayoutsPage() {
    const { showToast, showConfirm } = useNotification();
    const [workers, setWorkers] = useState<PayoutWorker[]>([]);
    const [loading, setLoading] = useState(true);
    const [settling, setSettling] = useState(false);
    const [summary, setSummary] = useState<any>(null);
    const [selectedWorkerBank, setSelectedWorkerBank] = useState<any>(null);
    const [viewingBankDetails, setViewingBankDetails] = useState(false);

    useEffect(() => {
        fetchWorkers();
    }, []);

    const fetchWorkers = async () => {
        setLoading(true);
        try {
            // Re-using the workers API but extending it for payout view
            const res = await fetch("/api/admin/workers", { headers: getAuthHeaders() });
            const data = await res.json();
            // In a real app, you'd have a specific payouts endpoint, 
            // but for now we filter and map based on verified status and balance.
            setWorkers(data.map((w: any) => ({
                ...w,
                pending_balance: w.pending_balance || 0,
                // We'll fetch verification status in a real implementation or assume it's in the profile
            })));
        } catch (err) {
            showToast("Failed to load workers", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSettleAll = async () => {
        const eligibleCount = workers.filter(w => w.pending_balance > 0).length;
        if (eligibleCount === 0) {
            showToast("No workers with pending balance.", "info");
            return;
        }

        const confirmed = await showConfirm(`Are you sure you want to trigger payouts for ${eligibleCount} workers? This will initiate bank transfers via Razorpay.`);
        if (!confirmed) return;

        setSettling(true);
        try {
            const res = await fetch("/api/admin/payouts/settle-all", {
                method: "POST",
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (res.ok) {
                setSummary(data);
                showToast(`Settlement complete: ${data.success_count} succeeded, ${data.failed_count} failed.`, "success");
                fetchWorkers();
            } else {
                showToast(data.error || "Settle All failed", "error");
            }
        } catch (err) {
            showToast("Error processing bulk settlement", "error");
        } finally {
            setSettling(false);
        }
    };

    const viewSecureBankDetails = async (workerId: number) => {
        try {
            const res = await fetch(`/api/admin/workers/${workerId}/bank-details`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (res.ok) {
                setSelectedWorkerBank(data.bank_details);
                setViewingBankDetails(true);
            } else {
                showToast(data.error || "Failed to fetch bank details", "error");
            }
        } catch (err) {
            showToast("Security error fetching bank details", "error");
        }
    };

    const handleVerifyStatus = async (workerId: number, status: number, reason?: string) => {
        try {
            const res = await fetch(`/api/admin/workers/${workerId}/bank-details`, {
                method: "PATCH",
                headers: getAuthHeaders(),
                body: JSON.stringify({ status, rejection_reason: reason })
            });
            if (res.ok) {
                showToast("Verification status updated", "success");
                setViewingBankDetails(false);
                fetchWorkers();
            }
        } catch (err) {
            showToast("Update failed", "error");
        }
    };

    const activeTab: string = "Payouts";
    return (
        <div className="admin-dashboard">
            <div className="admin-dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1>Worker Payouts</h1>
                    <p>Process pending settlements for verified workers.</p>
                </div>
                <button
                    onClick={handleSettleAll}
                    disabled={settling || loading}
                    className="admin-btn-save"
                    style={{ background: '#22c55e', padding: '0.75rem 1.5rem', borderRadius: '8px' }}
                >
                    {settling ? "Processing..." : "Settle All Ready Workers"}
                </button>
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

            {summary && (
                <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#1e293b', borderRadius: '12px', border: '1px solid #334155' }}>
                    <h3 style={{ margin: '0 0 1rem', color: '#f8fafc' }}>Settlement Summary</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>TOTAL PROCESSED</span>
                            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.25rem 0' }}>{summary.total_workers}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#4ade80' }}>SUCCESSFUL</span>
                            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.25rem 0', color: '#4ade80' }}>{summary.success_count}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#f87171' }}>FAILED</span>
                            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.25rem 0', color: '#f87171' }}>{summary.failed_count}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>TOTAL AMOUNT</span>
                            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.25rem 0', color: '#60a5fa' }}>₹{summary.total_amount.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            )}

            <section className="admin-section">
                {loading ? <p>Loading workers...</p> : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Worker</th>
                                    <th>Pending Balance</th>
                                    <th>Bank Status</th>
                                    <th>Last Payout</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {workers.map(w => (
                                    <tr key={w.id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{w.first_name} {w.last_name}</div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{w.email}</div>
                                        </td>
                                        <td style={{ fontWeight: 'bold', color: w.pending_balance > 0 ? '#4ade80' : 'inherit' }}>
                                            ₹{w.pending_balance.toFixed(2)}
                                        </td>
                                        <td>
                                            <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                background: w.is_bank_verified === 1 ? 'rgba(34,197,94,0.1)' : w.is_bank_verified === 2 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                                color: w.is_bank_verified === 1 ? '#4ade80' : w.is_bank_verified === 2 ? '#f87171' : '#fbbf24'
                                            }}>
                                                {w.is_bank_verified === 1 ? 'Verified' : w.is_bank_verified === 2 ? 'Rejected' : 'Pending'}
                                            </span>
                                        </td>
                                        <td>{w.last_payout_at ? new Date(w.last_payout_at).toLocaleDateString() : 'Never'}</td>
                                        <td>
                                            <button
                                                onClick={() => viewSecureBankDetails(w.id)}
                                                style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                            >
                                                Bank Details
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {viewingBankDetails && selectedWorkerBank && (
                <div className="admin-modal-overlay" onClick={() => setViewingBankDetails(false)}>
                    <div className="admin-modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
                        <h2>Secure Bank Details</h2>
                        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="admin-modal-row">
                                <label>Account Holder Name</label>
                                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>{selectedWorkerBank.account_holder_name}</div>
                            </div>
                            <div className="admin-modal-row">
                                <label>Bank Name</label>
                                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>{selectedWorkerBank.bank_name}</div>
                            </div>
                            <div className="admin-modal-row">
                                <label style={{ color: '#fbbf24' }}>Account Number (Decrypted)</label>
                                <div style={{ padding: '0.75rem', background: 'rgba(251,191,36,0.1)', border: '1px solid #fbbf24', borderRadius: '6px', fontSize: '1.1rem', letterSpacing: '2px', fontWeight: 'bold' }}>{selectedWorkerBank.account_number}</div>
                            </div>
                            <div className="admin-modal-row">
                                <label>IFSC Code</label>
                                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>{selectedWorkerBank.ifsc_code}</div>
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => handleVerifyStatus(selectedWorkerBank.worker_id, 1)}
                                style={{ flex: 1, padding: '0.75rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Approve Verification
                            </button>
                            <button
                                onClick={() => {
                                    const reason = prompt("Enter rejection reason:");
                                    if (reason) handleVerifyStatus(selectedWorkerBank.worker_id, 2, reason);
                                }}
                                style={{ flex: 1, padding: '0.75rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
