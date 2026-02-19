'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser, getAuthHeaders } from '@/app/utils/authGuard';

interface FuelStation {
    id: number;
    name: string;
    station_name: string;
    email: string;
    phone_number: string;
    address: string;
    is_verified: number | boolean;
    is_open: number | boolean;
    cod_enabled: number | boolean;
    created_at: string;
}

interface FuelStationDetail {
    station: {
        id: number;
        station_name: string;
        name?: string;
        email: string;
        phone_number: string;
        address: string;
        cod_enabled: boolean;
        cod_current_balance: number;
        cod_balance_limit: number;
        is_verified: boolean;
        is_open: boolean;
        platform_trust_flag: boolean;
        total_earnings: number;
        pending_payout: number;
        stocks: Record<string, number>;
    };
    recent_ledger: Array<any>;
}

function displayText(value: unknown, fallback = 'Not provided') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    if (!text) return fallback;
    const lowered = text.toLowerCase();
    if (lowered === 'null' || lowered === 'undefined' || lowered === 'n/a') return fallback;
    return text;
}

export default function FuelStationsPage() {
    const router = useRouter();
    const user = getCurrentUser();
    const [stations, setStations] = useState<FuelStation[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);

    useEffect(() => {
        if (!user || user.role !== 'Admin') {
            if (user && user.role !== 'Admin') router.push('/login');
            return;
        }
        fetchStations();
    }, [user?.role]);

    const fetchStations = async () => {
        setLoading(true);
        try {
            let url = '/api/fuel-stations';
            if (search) url += `?search=${encodeURIComponent(search)}`;

            const res = await fetch(url, { headers: getAuthHeaders() });
            const data = await res.json();
            if (Array.isArray(data)) {
                setStations(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchStations();
    };

    const getStatusBadge = (isOpen: number | boolean) => {
        const open = isOpen === 1 || isOpen === true;
        return (
            <span className={`px-2 py-1 rounded text-xs font-medium ${open ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {open ? 'Open' : 'Closed'}
            </span>
        );
    };

    const getVerifiedBadge = (isVerified: number | boolean) => {
        const verified = isVerified === 1 || isVerified === true;
        return (
            <span className={`px-2 py-1 rounded text-xs font-medium ${verified ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                {verified ? 'Verified' : 'Pending'}
            </span>
        );
    };

    const activeTab: string = "Fuel Stations";

    return (
        <div className="admin-dashboard">
            <div className="admin-dashboard-header">
                <h1>Fuel Stations Management</h1>
                <p>Manage fuel stations, their status, and verification.</p>
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

            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flex: 1, maxWidth: '400px' }}>
                    <input
                        type="text"
                        placeholder="Search by name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            padding: '0.5rem',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '4px',
                            background: 'rgba(0,0,0,0.2)',
                            color: 'white',
                            flex: 1
                        }}
                    />
                    <button
                        type="submit"
                        style={{
                            padding: '0.5rem 1rem',
                            background: 'rgba(255,255,255,0.1)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Search
                    </button>
                </form>

                <button
                    onClick={() => setShowAddModal(true)}
                    style={{
                        padding: '0.5rem 1rem',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Add Station
                </button>
            </div>

            <section className="admin-section">
                {loading && <p className="admin-loading">Loading stations...</p>}
                {!loading && stations.length === 0 && (
                    <p className="admin-table-empty">No fuel stations found.</p>
                )}

                {!loading && stations.length > 0 && (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Location</th>
                                    <th>Contact</th>
                                    <th>Status</th>
                                    <th>Verified</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stations.map(station => (
                                    <tr key={station.id}>
                                        <td>{station.id}</td>
                                        <td style={{ fontWeight: 500 }}>{station.station_name || station.name}</td>
                                        <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {displayText(station.address)}
                                        </td>
                                        <td>
                                            <div style={{ fontSize: '0.85rem' }}>{displayText(station.email)}</div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{displayText(station.phone_number)}</div>
                                        </td>
                                        <td>{getStatusBadge(station.is_open)}</td>
                                        <td>{getVerifiedBadge(station.is_verified)}</td>
                                        <td>
                                            <div className="admin-row-actions">
                                                <button
                                                    onClick={() => setSelectedStationId(station.id)}
                                                    className="admin-btn-edit"
                                                >
                                                    Manage
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (window.confirm('Are you sure you want to delete this fuel station? This action cannot be undone.')) {
                                                            try {
                                                                const res = await fetch(`/api/admin/fuel-stations/${station.id}`, {
                                                                    method: 'DELETE',
                                                                    headers: getAuthHeaders()
                                                                });
                                                                if (res.ok) {
                                                                    fetchStations();
                                                                } else {
                                                                    alert('Failed to delete station');
                                                                }
                                                            } catch (err) {
                                                                console.error(err);
                                                                alert('Error deleting station');
                                                            }
                                                        }
                                                    }}
                                                    className="admin-btn-delete"
                                                    style={{
                                                        marginLeft: '8px',
                                                        background: '#ef4444',
                                                        color: 'white',
                                                        border: 'none',
                                                        padding: '0.4rem 0.8rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.8125rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {selectedStationId && (
                <ManageStationModal
                    id={selectedStationId}
                    onClose={() => {
                        setSelectedStationId(null);
                        fetchStations();
                    }}
                />
            )}

            {showAddModal && (
                <AddStationModal
                    onClose={() => {
                        setShowAddModal(false);
                        fetchStations();
                    }}
                />
            )}
        </div>
    );
}

function ManageStationModal({ id, onClose }: { id: number; onClose: () => void }) {
    const [station, setStation] = useState<FuelStationDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        is_verified: false,
        cod_enabled: false,
        cod_balance_limit: 50000,
        is_open: true,
        platform_trust_flag: false,
        new_password: '',
    });

    useEffect(() => {
        fetchDetails();
    }, [id]);

    const fetchDetails = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/admin/fuel-stations/${id}`, { headers: getAuthHeaders() });
            const data = await res.json();
            if (data.success) {
                setStation(data);
                setFormData({
                    is_verified: !!data.station.is_verified,
                    cod_enabled: !!data.station.cod_enabled,
                    cod_balance_limit: data.station.cod_balance_limit || 50000,
                    is_open: !!data.station.is_open,
                    platform_trust_flag: !!data.station.platform_trust_flag,
                    new_password: '',
                });
            }
        } catch (err) {
            setError('Failed to load details');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/admin/fuel-stations/${id}`, {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                onClose();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to update');
            }
        } catch (err) {
            setError('Error saving changes');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return (
        <div className="admin-modal-overlay">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
        </div>
    );

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div
                className="admin-modal"
                style={{ maxWidth: '1000px', width: '95%', maxHeight: '90vh', overflowY: 'auto', background: '#1e293b' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>Manage Fuel Station</h2>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>{station?.station.station_name || station?.station.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', padding: '0.5rem' }}
                    >
                        ✕
                    </button>
                </div>

                <div className="admin-modal-form">
                    {error && <div className="admin-table-error" style={{ marginBottom: '1rem' }}>{error}</div>}

                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        {/* Left Column */}
                        <div style={{ flex: 1, minWidth: '300px' }}>
                            <h3 className="admin-modal-section-title" style={{ marginBottom: '1rem' }}>Station Information</h3>

                            <div className="admin-modal-row" style={{ marginBottom: '1rem' }}>
                                <label>Station Name</label>
                                <input type="text" value={station?.station.station_name || station?.station.name || ''} readOnly style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                            </div>
                            <div className="admin-modal-row" style={{ marginBottom: '1rem' }}>
                                <label>Email</label>
                                <input type="text" value={displayText(station?.station.email)} readOnly style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                            </div>
                            <div className="admin-modal-row" style={{ marginBottom: '1rem' }}>
                                <label>Phone</label>
                                <input type="text" value={displayText(station?.station.phone_number)} readOnly style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                            </div>
                            <div className="admin-modal-row" style={{ marginBottom: '1.5rem' }}>
                                <label>Address</label>
                                <textarea
                                    value={displayText(station?.station.address)}
                                    readOnly
                                    rows={3}
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', opacity: 0.7, cursor: 'not-allowed', resize: 'none' }}
                                />
                            </div>

                            <div className="admin-modal-row" style={{ marginBottom: '1.5rem', marginTop: '1rem' }}>
                                <label>Reset Password (leave blank to keep current)</label>
                                <input
                                    type="password"
                                    placeholder="Enter new password..."
                                    value={formData.new_password}
                                    onChange={e => setFormData({ ...formData, new_password: e.target.value })}
                                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={formData.is_verified} onChange={e => setFormData({ ...formData, is_verified: e.target.checked })} style={{ width: 'auto' }} />
                                    <span style={{ fontSize: '0.9rem', color: '#cbd5f5' }}>Identity Verified</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={formData.is_open} onChange={e => setFormData({ ...formData, is_open: e.target.checked })} style={{ width: 'auto' }} />
                                    <span style={{ fontSize: '0.9rem', color: '#cbd5f5' }}>Station Open</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={formData.cod_enabled} onChange={e => setFormData({ ...formData, cod_enabled: e.target.checked })} style={{ width: 'auto' }} />
                                    <span style={{ fontSize: '0.9rem', color: '#cbd5f5' }}>Enable COD</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={formData.platform_trust_flag} onChange={e => setFormData({ ...formData, platform_trust_flag: e.target.checked })} style={{ width: 'auto' }} />
                                    <span style={{ fontSize: '0.9rem', color: '#cbd5f5' }}>Platform Trusted</span>
                                </label>
                            </div>

                            <div className="admin-modal-row" style={{ marginTop: '1.5rem' }}>
                                <label>COD Balance Limit (₹)</label>
                                <input
                                    type="number"
                                    value={formData.cod_balance_limit}
                                    onChange={e => setFormData({ ...formData, cod_balance_limit: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>

                        {/* Right Column */}
                        <div style={{ flex: 1, minWidth: '300px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '2rem' }}>
                            <h3 className="admin-modal-section-title" style={{ marginBottom: '1rem' }}>Financials & Stock</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Total Earnings</span>
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#4ade80' }}>₹{station?.station.total_earnings.toLocaleString()}</p>
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Pending Payout</span>
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#fb923c' }}>₹{station?.station.pending_payout.toLocaleString()}</p>
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Petrol Stock</span>
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#60a5fa' }}>{station?.station.stocks.petrol || 0} L</p>
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Diesel Stock</span>
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '1.25rem', fontWeight: 'bold', color: '#c084fc' }}>{station?.station.stocks.diesel || 0} L</p>
                                </div>
                            </div>

                            <div style={{ marginTop: '2rem' }}>
                                <h3 className="admin-modal-section-title" style={{ marginBottom: '1rem' }}>Recent Transactions</h3>
                                <div style={{ maxHeight: '250px', overflowY: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
                                    {station?.recent_ledger && station.recent_ledger.length > 0 ? (
                                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                                            <thead style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                                                <tr>
                                                    <th style={{ padding: '0.5rem' }}>Type</th>
                                                    <th style={{ padding: '0.5rem' }}>Amount</th>
                                                    <th style={{ padding: '0.5rem' }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {station.recent_ledger.map((entry: any) => (
                                                    <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                        <td style={{ padding: '0.5rem', textTransform: 'capitalize' }}>{entry.transaction_type}</td>
                                                        <td style={{ padding: '0.5rem', color: '#4ade80' }}>₹{entry.amount}</td>
                                                        <td style={{ padding: '0.5rem' }}>
                                                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', background: entry.status === 'settled' ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)', color: entry.status === 'settled' ? '#4ade80' : '#fbbf24' }}>
                                                                {entry.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>No transactions found</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: 'white', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="admin-btn-save"
                        style={{ padding: '0.6rem 2rem', borderRadius: '8px', background: '#22c55e', border: 'none', color: 'white', fontWeight: 600, cursor: 'pointer' }}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function AddStationModal({ onClose }: { onClose: () => void }) {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        station_name: '',
        email: '',
        phone_number: '',
        address: '',
        latitude: '',
        longitude: '',
        password: '',
        cod_enabled: false
    });

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.station_name || !formData.latitude || !formData.longitude || !formData.password) {
            setError('Please fill in required fields (Name, Lat, Lng, Password)');
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            // Include 'name' for backwards compatibility if API uses it
            const payload = { ...formData, name: formData.station_name };
            const res = await fetch('/api/fuel-stations', {
                method: 'POST',
                headers: {
                    ...getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                onClose();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to create station');
            }
        } catch (err) {
            setError('Error connecting to server');
        } finally {
            setIsSaving(false);
        }
    };

    const inputStyle = {
        width: '100%',
        padding: '0.6rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '6px',
        color: 'white'
    };

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal" style={{ maxWidth: '600px', width: '90%', background: '#1e293b' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                    <h2 style={{ margin: 0 }}>Create New Fuel Station</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                </div>

                <form onSubmit={handleSave} className="admin-modal-form">
                    {error && <div className="admin-table-error" style={{ marginBottom: '1rem', color: '#ef4444' }}>{error}</div>}

                    <div className="admin-modal-row">
                        <label>Station Name *</label>
                        <input type="text" value={formData.station_name} onChange={e => setFormData({ ...formData, station_name: e.target.value })} required style={inputStyle} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="admin-modal-row">
                            <label>Email</label>
                            <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} style={inputStyle} />
                        </div>
                        <div className="admin-modal-row">
                            <label>Phone</label>
                            <input type="text" value={formData.phone_number} onChange={e => setFormData({ ...formData, phone_number: e.target.value })} style={inputStyle} />
                        </div>
                    </div>

                    <div className="admin-modal-row">
                        <label>Password *</label>
                        <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} required style={inputStyle} placeholder="Set station password" />
                    </div>

                    <div className="admin-modal-row">
                        <label>Address</label>
                        <textarea rows={2} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} style={{ ...inputStyle, resize: 'none' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="admin-modal-row">
                            <label>Latitude *</label>
                            <input type="number" step="any" value={formData.latitude} onChange={e => setFormData({ ...formData, latitude: e.target.value })} required style={inputStyle} />
                        </div>
                        <div className="admin-modal-row">
                            <label>Longitude *</label>
                            <input type="number" step="any" value={formData.longitude} onChange={e => setFormData({ ...formData, longitude: e.target.value })} required style={inputStyle} />
                        </div>
                    </div>

                    <div className="admin-modal-row" style={{ marginTop: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={formData.cod_enabled} onChange={e => setFormData({ ...formData, cod_enabled: e.target.checked })} style={{ width: 'auto' }} />
                            <span style={{ fontSize: '0.9rem', color: '#cbd5f5' }}>Enable COD by default</span>
                        </label>
                    </div>

                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.6rem 1.25rem', borderRadius: '6px', border: '1px solid #334155', background: 'none', color: 'white', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={isSaving} className="admin-btn-save" style={{ padding: '0.6rem 2rem', borderRadius: '6px', background: '#22c55e', border: 'none', color: 'white', fontWeight: 600, cursor: 'pointer', opacity: isSaving ? 0.7 : 1 }}>
                            {isSaving ? 'Creating...' : 'Create Station'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
