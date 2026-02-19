'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, getAuthHeaders } from '@/app/utils/authGuard';

interface CODSettings {
  cod_settings: {
    station_id: number;
    station_name: string;
    cod_enabled: boolean;
    is_verified: boolean;
    cod_current_balance: number;
    cod_balance_limit: number;
    platform_trust_flag: boolean;
    can_accept_cod: boolean;
  };
  pending_cod: {
    count: number;
    total_pending: number;
  };
}

export default function CODSettingsPage() {
  const user = getCurrentUser();
  const [settings, setSettings] = useState<CODSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    cod_enabled: false,
    cod_balance_limit: 50000,
  });

  useEffect(() => {
    if (!user) return;
    fetchCODSettings();
  }, [user?.id]);

  const fetchCODSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/fuel-station/cod-settings?fuel_station_id=${user?.id}`,
        { headers: getAuthHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch COD settings');

      const data = await response.json();
      if (data.success) {
        setSettings(data);
        setFormData({
          cod_enabled: data.cod_settings.cod_enabled,
          cod_balance_limit: data.cod_settings.cod_balance_limit,
        });
      }
    } catch (err) {
      setError('Failed to load COD settings');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setError('');
      setSuccess('');
      setIsSaving(true);

      const response = await fetch('/api/fuel-station/cod-settings', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          fuel_station_id: user?.id,
          ...formData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to update COD settings');
        return;
      }

      setSuccess('COD settings updated successfully');
      setTimeout(() => fetchCODSettings(), 500);
    } catch (err) {
      setError('Error updating COD settings');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return <div className="text-center py-8">Please login first</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="station-content">
      {/* Header */}
      <div className="station-page-header">
        <h1>COD Settings</h1>
        <p>Manage your Cash on Delivery preferences</p>
      </div>

      {error && (
        <div className="station-badge-danger" style={{ padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="station-badge-success" style={{ padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
          {success}
        </div>
      )}

      {settings && (
        <>
          {/* Current Status */}
          <div className="station-card">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.5rem' }}>Current Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {/* COD Status */}
              <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem' }}>COD Status</p>
                <p style={{ fontSize: '1.125rem', fontWeight: 700, color: settings.cod_settings.cod_enabled ? '#22c55e' : '#ef4444' }}>
                  {settings.cod_settings.cod_enabled ? '✓ Enabled' : '✗ Disabled'}
                </p>
              </div>

              {/* Current Balance */}
              <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem' }}>Current COD Balance</p>
                <p style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  ₹{settings.cod_settings.cod_current_balance.toLocaleString('en-IN')}
                </p>
              </div>

              {/* Can Accept COD */}
              <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem' }}>Can Accept New COD</p>
                <p style={{ fontSize: '1.125rem', fontWeight: 700, color: settings.cod_settings.can_accept_cod ? '#22c55e' : '#eab308' }}>
                  {settings.cod_settings.can_accept_cod ? '✓ Yes' : '✗ No'}
                </p>
              </div>

              {/* Identity Verification */}
              <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem' }}>Identity Verification</p>
                <p style={{ fontSize: '1.125rem', fontWeight: 700, color: settings.cod_settings.is_verified ? '#22c55e' : '#eab308' }}>
                  {settings.cod_settings.is_verified ? '✓ Verified' : '⏳ Pending'}
                </p>
              </div>

              {/* Platform Trust */}
              <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem' }}>Platform Trust Status</p>
                <p style={{ fontSize: '1.125rem', fontWeight: 700, color: settings.cod_settings.platform_trust_flag ? '#22c55e' : '#eab308' }}>
                  {settings.cod_settings.platform_trust_flag ? '✓ Trusted' : '⏳ Pending'}
                </p>
              </div>
            </div>
          </div>

          {/* Settings Form */}
          <div className="station-card">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.5rem' }}>Configuration</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* COD Toggle */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input
                    type="checkbox"
                    id="cod_enabled"
                    checked={formData.cod_enabled}
                    onChange={(e) =>
                      setFormData({ ...formData, cod_enabled: e.target.checked })
                    }
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="cod_enabled" style={{ fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
                    Enable Cash on Delivery (COD)
                  </label>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.75rem', marginLeft: '2.25rem' }}>
                  Allow customers to pay with cash when their order is completed.
                </p>
              </div>

              {/* Balance Limit */}
              <div>
                <label htmlFor="cod_balance_limit" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
                  COD Balance Limit (₹)
                </label>
                <input
                  type="number"
                  id="cod_balance_limit"
                  min="0"
                  value={formData.cod_balance_limit}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cod_balance_limit: parseInt(e.target.value) || 0,
                    })
                  }
                  className="station-input"
                />
                <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.75rem' }}>
                  Maximum pending COD amount before accepting new orders. Current: ₹{settings.cod_settings.cod_current_balance.toLocaleString('en-IN')} / ₹{formData.cod_balance_limit.toLocaleString('en-IN')}
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="station-btn station-btn-primary"
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  onClick={fetchCODSettings}
                  className="station-btn station-btn-secondary"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

         

          {/* Information */}
          <div className="station-info-box">
            <h3 style={{ fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>💡</span> About COD
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              <li>✓ COD allows customers to pay cash when fuel is delivered</li>
              <li>✓ Your balance limit protects against excessive pending amounts</li>
              <li>✓ Platform trust status is required to accept COD orders</li>
              <li>✓ Pending amounts are settled regularly by the admin</li>
              <li>✓ Disabling COD will prevent new COD orders, but current ones continue</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
