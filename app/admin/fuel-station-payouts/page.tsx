'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser, getAuthHeaders, isAdmin } from '@/app/utils/authGuard';
import { useNotification } from '@/app/NotificationSystem';

interface Payout {
    id: number;
    fuel_station_id: number;
    transaction_type: string;
    amount: number;
    description: string;
    status: string;
    created_at: string;
    station_name: string;
    email: string;
}

interface Station {
    id: number;
    station_name: string;
}

export default function PayoutsPage() {
    const { showToast, showConfirm } = useNotification();
    const router = useRouter();
    const user = getCurrentUser();
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [loading, setLoading] = useState(true);
    const [settling, setSettling] = useState(false);
    const [summary, setSummary] = useState<any>(null);
    const [selectedStation, setSelectedStation] = useState('');
    const [stations, setStations] = useState<Station[]>([]);

    useEffect(() => {
        if (!isAdmin()) {
            if (getCurrentUser()) router.push('/login');
            return;
        }
        fetchStations();
        fetchPayouts();
    }, [user?.role]);

    useEffect(() => {
        fetchPayouts();
    }, [selectedStation]);

    const fetchStations = async () => {
        try {
            const res = await fetch('/api/fuel-stations', { headers: getAuthHeaders() });
            const data = await res.json();
            if (Array.isArray(data)) setStations(data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchPayouts = async () => {
        setLoading(true);
        try {
            let url = '/api/admin/fuel-station-payouts?status=pending';
            if (selectedStation) url += `&fuel_station_id=${selectedStation}`;

            const res = await fetch(url, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) {
                setPayouts(data.payouts || []);
            } else {
                showToast(data.error || 'Failed to load station payouts', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to load station payouts', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSettleAll = async () => {
        const stationIds = new Set(payouts.map((p) => p.fuel_station_id));
        const eligibleCount = stationIds.size;
        if (eligibleCount === 0) {
            showToast('No stations with pending payouts.', 'info');
            return;
        }

        const confirmed = await showConfirm(`Are you sure you want to settle payouts for ${eligibleCount} station(s)?`);
        if (!confirmed) return;

        setSettling(true);
        try {
            const res = await fetch('/api/admin/fuel-station-payouts/settle-all', {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(selectedStation ? { fuel_station_id: Number(selectedStation) } : {}),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setSummary(data);
                showToast(
                    `Settlement complete: ${data.success_count} succeeded, ${data.failed_count} failed.`,
                    'success'
                );
                fetchPayouts();
            } else {
                showToast(data.error || 'Settle All failed', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error processing station settlements', 'error');
        } finally {
            setSettling(false);
        }
    };

    const activeTab: string = "Station Payouts";
    return (
        <div className="admin-dashboard">
            <div className="admin-dashboard-header">
                <h1>Station Payouts</h1>
                <p>Manage and settle pending payouts for fuel stations.</p>
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

            <div className="admin-actions-bar" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <select
                    className="admin-select"
                    value={selectedStation}
                    onChange={(e) => setSelectedStation(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#222', color: 'white' }}
                >
                    <option value="">All Stations</option>
                    {stations.map((s) => (
                        <option key={s.id} value={s.id}>{s.station_name}</option>
                    ))}
                </select>
                <button
                    onClick={fetchPayouts}
                    className="admin-btn-secondary"
                    style={{ padding: '0.5rem 1rem', borderRadius: '4px', background: '#374151', color: 'white', border: 'none', cursor: 'pointer' }}
                >
                    Refresh
                </button>
                {payouts.length > 0 && (
                    <button
                        onClick={handleSettleAll}
                        disabled={settling || loading}
                        className="admin-btn-primary"
                        style={{ padding: '0.5rem 1rem', borderRadius: '4px', background: '#059669', color: 'white', border: 'none', cursor: 'pointer' }}
                    >
                        {settling ? 'Processing...' : `Settle All Ready Stations (${new Set(payouts.map((p) => p.fuel_station_id)).size})`}
                    </button>
                )}
            </div>

            {summary && (
                <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#1e293b', borderRadius: '12px', border: '1px solid #334155' }}>
                    <h3 style={{ margin: '0 0 1rem', color: '#f8fafc' }}>Settlement Summary</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>TOTAL PROCESSED</span>
                            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.25rem 0' }}>{summary.total_stations}</p>
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
                            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0.25rem 0', color: '#60a5fa' }}>Rs. {Number(summary.total_amount || 0).toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            )}

            <section className="admin-section">
                {loading ? (
                    <p className="admin-loading">Loading payouts...</p>
                ) : (
                    <>
                        {payouts.length === 0 ? (
                            <p className="admin-table-empty">No pending payouts found.</p>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Station</th>
                                            <th>Reference</th>
                                            <th>Amount</th>
                                            <th>Type</th>
                                            <th>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payouts.map((p) => (
                                            <tr key={p.id}>
                                                <td style={{ fontWeight: 500 }}>{p.station_name}</td>
                                                <td style={{ color: '#9ca3af', fontSize: '0.9em' }}>{p.description || '-'}</td>
                                                <td style={{ color: '#10b981', fontWeight: 'bold' }}>Rs. {Number(p.amount || 0).toFixed(2)}</td>
                                                <td style={{ textTransform: 'capitalize' }}>{p.transaction_type}</td>
                                                <td>{new Date(p.created_at).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}

