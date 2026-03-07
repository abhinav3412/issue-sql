'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAuthHeaders, getCurrentUser } from '@/app/utils/authGuard';

interface FuelStationDetail {
  station: {
    id: number;
    station_name: string;
    email: string;
    phone_number: string;
    address: string;
    latitude: number;
    longitude: number;
    cod_enabled: boolean;
    cod_current_balance: number;
    cod_balance_limit: number;
    is_verified: boolean;
    is_open: boolean;
    platform_trust_flag: boolean;
    total_earnings: number;
    pending_payout: number;
    created_at: string;
    updated_at: string;
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

export default function FuelStationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const user = getCurrentUser();
  const id = params.id as string;

  const [station, setStation] = useState<FuelStationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [formData, setFormData] = useState({
    is_verified: false,
    cod_enabled: false,
    cod_balance_limit: 50000,
    is_open: true,
    platform_trust_flag: false,
  });

  useEffect(() => {
    setMounted(true);
    if (user?.role !== 'Admin') {
      // We handle redirect in the next useEffect or let the auth guard handle it usually, 
      // but for now let's just ensure we don't fetch if not admin.
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!user || user.role !== 'Admin') {
      if (user && user.role !== 'Admin') router.push('/login');
      return;
    }
    fetchStationDetails();
  }, [mounted, user?.role, router, id]);

  const fetchStationDetails = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/admin/fuel-stations/${id}`,
        { headers: getAuthHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch station');

      const data = await response.json();
      if (data.success) {
        setStation(data);
        setFormData({
          is_verified: !!data.station.is_verified,
          cod_enabled: !!data.station.cod_enabled,
          cod_balance_limit: data.station.cod_balance_limit || 50000,
          is_open: !!data.station.is_open,
          platform_trust_flag: !!data.station.platform_trust_flag,
        });
      }
    } catch (err) {
      setError('Failed to load station details');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    try {
      setError('');
      setIsSaving(true);

      const response = await fetch(
        `/api/admin/fuel-stations/${id}`,
        {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(formData),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to update station');
        return;
      }

      setEditMode(false);
      setTimeout(() => fetchStationDetails(), 500);
    } catch (err) {
      setError('Error updating station');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!mounted) return <div className="admin-dashboard p-6" style={{ backgroundColor: '#020617', color: 'white' }}>Loading...</div>;

  if (!user || user.role !== 'Admin') {
    return <div className="admin-dashboard p-6" style={{ backgroundColor: '#020617' }}><div className="text-red-500">Admin access required</div></div>;
  }

  if (isLoading) {
    return (
      <div className="admin-dashboard p-6 flex justify-center items-center" style={{ backgroundColor: '#020617', minHeight: '100vh' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (!station) {
    return (
      <div className="admin-dashboard p-6" style={{ backgroundColor: '#020617', minHeight: '100vh', color: 'white' }}>
        <div className="text-center py-8 text-red-500">Fuel station not found</div>
        <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-gray-700 rounded text-white">Go Back</button>
      </div>
    );
  }

  const inputStyle = {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    color: '#e2e8f0'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="rounded-xl shadow-2xl w-full max-w-6xl text-white border max-h-[90vh] overflow-y-auto flex flex-col"
        style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}
      >
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center sticky top-0 z-10" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
          <div>
            <h2 className="text-2xl font-bold text-white">Manage Fuel Station</h2>
            <p className="text-gray-400 text-sm mt-1">{station?.station.station_name}</p>
          </div>
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white transition text-xl px-2"
          >
            ✕
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Station Details Form */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Station Information</h3>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Station Name</label>
              <input
                type="text"
                value={station?.station.station_name || ''}
                readOnly
                className="w-full px-3 py-2 rounded-lg focus:outline-none border"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
              <input
                type="text"
                value={displayText(station?.station.email)}
                readOnly
                className="w-full px-3 py-2 rounded-lg focus:outline-none border"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Phone</label>
              <input
                type="text"
                value={displayText(station?.station.phone_number)}
                readOnly
                className="w-full px-3 py-2 rounded-lg focus:outline-none border"
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Address</label>
              <textarea
                value={displayText(station?.station.address)}
                readOnly
                rows={3}
                className="w-full px-3 py-2 rounded-lg focus:outline-none border resize-none"
                style={inputStyle}
              />
            </div>

            <div className="pt-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition">
                <input
                  type="checkbox"
                  checked={formData.is_verified}
                  onChange={(e) => setFormData({ ...formData, is_verified: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded bg-gray-800 border-gray-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-300">Identity Verified</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition">
                <input
                  type="checkbox"
                  checked={formData.is_open}
                  onChange={(e) => setFormData({ ...formData, is_open: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded bg-gray-800 border-gray-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-300">Station Open</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition">
                <input
                  type="checkbox"
                  checked={formData.cod_enabled}
                  onChange={(e) => setFormData({ ...formData, cod_enabled: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded bg-gray-800 border-gray-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-300">Enable COD</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition">
                <input
                  type="checkbox"
                  checked={formData.platform_trust_flag}
                  onChange={(e) => setFormData({ ...formData, platform_trust_flag: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded bg-gray-800 border-gray-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-300">Platform Trusted</span>
              </label>
            </div>

            <div className="pt-4">
              <label className="block text-sm font-medium text-gray-400 mb-1">COD Balance Limit (₹)</label>
              <input
                type="number"
                value={formData.cod_balance_limit}
                onChange={(e) => setFormData({ ...formData, cod_balance_limit: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-500"
                style={{ ...inputStyle, color: 'white' }}
              />
            </div>
          </div>

          {/* Right Column: Stats & Ledger */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-200">Financials & Stock</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
                <p className="text-xs text-gray-500 uppercase">Total Earnings</p>
                <p className="text-xl font-bold text-green-400 mt-1">₹{station?.station.total_earnings.toLocaleString()}</p>
              </div>
              <div className="p-4 rounded-lg border" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
                <p className="text-xs text-gray-500 uppercase">Pending Payout</p>
                <p className="text-xl font-bold text-orange-400 mt-1">₹{station?.station.pending_payout.toLocaleString()}</p>
              </div>
              <div className="p-4 rounded-lg border" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
                <p className="text-xs text-gray-500 uppercase">Petrol Stock</p>
                <p className="text-xl font-bold text-blue-400 mt-1">{station?.station.stocks.petrol || 0} L</p>
              </div>
              <div className="p-4 rounded-lg border" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
                <p className="text-xs text-gray-500 uppercase">Diesel Stock</p>
                <p className="text-xl font-bold text-purple-400 mt-1">{station?.station.stocks.diesel || 0} L</p>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-200 mb-4">Recent Transactions</h3>
              <div className="rounded-lg border overflow-hidden max-h-[300px] overflow-y-auto" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
                {station?.recent_ledger && station.recent_ledger.length > 0 ? (
                  <table className="w-full text-sm text-left">
                    <thead className="text-gray-400 sticky top-0" style={{ backgroundColor: '#1e293b' }}>
                      <tr>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">Amount</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {station.recent_ledger.map((entry: any) => (
                        <tr key={entry.id} className="hover:bg-white/5 transition">
                          <td className="px-4 py-2 capitalize text-gray-300">{entry.transaction_type}</td>
                          <td className="px-4 py-2 font-mono text-green-400">₹{entry.amount}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${entry.status === 'settled' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                              {entry.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{new Date(entry.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-4 text-center text-gray-500">No recent transactions found.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-700 flex justify-end gap-3 bg-[#1e293b] rounded-b-xl sticky bottom-0">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg bg-white text-gray-900 font-medium hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveChanges}
            disabled={isSaving}
            className="px-6 py-2 rounded-lg bg-[#22c55e] text-white font-medium hover:bg-[#16a34a] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-900/20"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
