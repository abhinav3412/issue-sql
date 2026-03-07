'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCurrentUser, getAuthHeaders } from '@/app/utils/authGuard';

interface DashboardStats {
  total_earnings: number;
  pending_payout: number;
  petrol_stock: number;
  diesel_stock: number;
  cod_enabled: boolean;
  pending_cod_settlements: number;
  total_orders_fulfilled: number;
  verification_status: string;
}

export default function FuelStationDashboard() {
  const user = getCurrentUser();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;

    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        // Fetch earnings and profile status
        const earningsRes = await fetch(
          `/api/fuel-station/earnings?fuel_station_id=${user.id}`,
          { headers: getAuthHeaders() }
        );
        const earningsData = await earningsRes.json();

        // Fetch current stock
        const stockRes = await fetch(
          `/api/fuel-station/stock?fuel_station_id=${user.id}`,
          { headers: getAuthHeaders() }
        );
        const stockData = await stockRes.json();

        if (earningsData.success && stockData.success) {
          const petrolStock = stockData.stocks.find((s: any) => s.fuel_type === 'petrol')?.stock_litres || 0;
          const dieselStock = stockData.stocks.find((s: any) => s.fuel_type === 'diesel')?.stock_litres || 0;

          setStats({
            total_earnings: earningsData.station_earnings?.total_earnings || 0,
            pending_payout: earningsData.station_earnings?.pending_payout || 0,
            petrol_stock: petrolStock,
            diesel_stock: dieselStock,
            cod_enabled: earningsData.station_earnings?.cod_enabled === 1,
            pending_cod_settlements: earningsData.cod_settlements?.filter((s: any) => s.payment_status === 'pending').length || 0,
            total_orders_fulfilled: earningsData.summary?.total_transactions || 0,
            verification_status: earningsData.station_earnings?.is_verified === 1 ? 'Verified' : 'Pending Verification',
          });
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [user?.id]);

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
      <div className="station-dashboard-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {user?.station_name || 'Fuel Station'}!</p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.75rem', padding: '1rem', color: '#ef4444', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {/* Stats Grid */}
      {stats && (
        <div className="station-grid">
          {/* Total Earnings */}
          <div className="station-card">
            <div className="station-stat-header">
              <span className="station-stat-label">Total Earnings</span>
              <div className="station-stat-icon bg-green-soft">💰</div>
            </div>
            <div className="station-stat-value">
              ₹{stats.total_earnings.toLocaleString('en-IN')}
            </div>
          </div>

          {/* Pending Payout */}
          <div className="station-card">
            <div className="station-stat-header">
              <span className="station-stat-label">Pending Payout</span>
              <div className="station-stat-icon bg-yellow-soft">⏳</div>
            </div>
            <div className="station-stat-value">
              ₹{stats.pending_payout.toLocaleString('en-IN')}
            </div>
          </div>

          {/* Petrol Stock */}
          <div className="station-card">
            <div className="station-stat-header">
              <span className="station-stat-label">Petrol Stock</span>
              <div className="station-stat-icon bg-blue-soft">⛽</div>
            </div>
            <div className="station-stat-value">
              {stats.petrol_stock}L
            </div>
          </div>

          {/* Diesel Stock */}
          <div className="station-card">
            <div className="station-stat-header">
              <span className="station-stat-label">Diesel Stock</span>
              <div className="station-stat-icon bg-purple-soft">⛽</div>
            </div>
            <div className="station-stat-value">
              {stats.diesel_stock}L
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {stats && (
        <div className="station-status-grid">
          {/* Verification Status */}
          <div className="station-status-card">
            <h3>Verification Status</h3>
            <div className={`station-status-value ${stats.verification_status === 'Verified' ? 'text-green' : 'text-orange'}`} style={{ color: stats.verification_status === 'Verified' ? '#22c55e' : '#eab308' }}>
              {stats.verification_status}
            </div>
          </div>

          {/* COD Status */}
          <div className="station-status-card">
            <h3>COD Status</h3>
            <div className={`station-status-value ${stats.cod_enabled ? 'text-green' : 'text-red'}`} style={{ color: stats.cod_enabled ? '#22c55e' : '#ef4444' }}>
              {stats.cod_enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>

          {/* Pending COD Settlements */}
          
        </div>
      )}

      {/* Quick Actions */}
      <div className="station-actions-section">
        <h3>Quick Actions</h3>
        <div className="station-actions-grid">
          <Link href="/fuel-station/stock" className="station-action-link">
            <span className="station-action-icon">📦</span>
            <span className="station-action-title">Update Stock</span>
            <span className="station-action-desc">Manage petrol & diesel inventory</span>
          </Link>

          <Link href="/fuel-station/earnings" className="station-action-link">
            <span className="station-action-icon">💰</span>
            <span className="station-action-title">View Earnings</span>
            <span className="station-action-desc">Check payouts & transactions</span>
          </Link>

          <Link href="/fuel-station/cod-settings" className="station-action-link">
            <span className="station-action-icon">⚙️</span>
            <span className="station-action-title">COD Settings</span>
            <span className="station-action-desc">Manage COD preferences</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

