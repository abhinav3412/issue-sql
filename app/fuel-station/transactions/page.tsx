'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCurrentUser, getAuthHeaders } from '@/app/utils/authGuard';

export default function TransactionsPage() {
  const user = getCurrentUser();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setIsLoading(false);
  }, [user?.id]);

  if (!user) {
    return <div className="text-center py-8">Please login first</div>;
  }

  return (
    <div className="station-content">
      {/* Header */}
      <div className="station-page-header">
        <h1>Transaction History</h1>
        <p>Detailed view of all your transactions</p>
      </div>

      {/* Info Box */}
      <div className="station-info-box">
        <h3 style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Transaction Details</h3>
        <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem', opacity: 0.9 }}>
          This page shows detailed transaction history including:
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', opacity: 0.8 }}>
          <li>✓ Stock updates and refills</li>
          <li>✓ Sales and earnings</li>
          <li>✓ COD settlements</li>
          <li>✓ Payout deposits</li>
          <li>✓ Platform fees and deductions</li>
        </ul>
      </div>

      {/* Placeholder for Transaction List */}
      <div className="station-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <p style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f8fafc' }}>Transaction history will appear here</p>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
          Transactions are logged automatically when orders are completed or stock is updated
        </p>
      </div>

      {/* Quick Navigation */}
      <div className="station-card">
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.5rem' }}>Related Pages</h3>
        <div className="station-card-grid">
          <Link
            href="/fuel-station/earnings"
            className="station-action-link"
          >
            <span className="station-action-icon">📊</span>
            <span className="station-action-title">Earnings & Payouts</span>
            <span className="station-action-desc">View your earnings summary</span>
          </Link>

          <Link
            href="/fuel-station/stock"
            className="station-action-link"
          >
            <span className="station-action-icon">📦</span>
            <span className="station-action-title">Stock Management</span>
            <span className="station-action-desc">Manage inventory levels</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
