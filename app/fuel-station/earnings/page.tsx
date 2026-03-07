'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, getAuthHeaders } from '@/app/utils/authGuard';

interface EarningsData {
  station_earnings: {
    total_earnings: number;
    pending_payout: number;
  };
  summary: {
    total_transactions: number;
    completed_earnings: number;
    settled_earnings: number;
    pending_earnings: number;
  };
  transactions: Array<{
    id: number;
    transaction_type: string;
    amount: number;
    description: string;
    status: string;
    created_at: string;
  }>;
}

interface StationBankDetails {
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  updated_at?: string;
}

export default function EarningsPage() {
  const user = getCurrentUser();
  const [data, setData] = useState<EarningsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [bankDetails, setBankDetails] = useState<StationBankDetails | null>(null);
  const [bankForm, setBankForm] = useState({
    account_holder_name: '',
    account_number: '',
    ifsc_code: '',
    bank_name: '',
  });
  const [savingBank, setSavingBank] = useState(false);
  const [bankMessage, setBankMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchEarningsData();
    fetchBankDetails();
  }, [user?.id]);

  const fetchEarningsData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/fuel-station/earnings?fuel_station_id=${user?.id}&limit=20`,
        { headers: getAuthHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch earnings');

      const responseData = await response.json();
      if (responseData.success) {
        setData(responseData);
      }
    } catch (err) {
      setError('Failed to load earnings data');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBankDetails = async () => {
    try {
      const response = await fetch('/api/fuel-station/bank-details', {
        headers: getAuthHeaders(),
      });
      const responseData = await response.json();
      if (response.ok && responseData.success) {
        setBankDetails(responseData.bank_details || null);
      }
    } catch (err) {
      console.error('Failed to fetch station bank details:', err);
    }
  };

  const saveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBank(true);
    setBankMessage('');

    try {
      const response = await fetch('/api/fuel-station/bank-details', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bankForm),
      });

      const responseData = await response.json();
      if (!response.ok || !responseData.success) {
        throw new Error(responseData.error || 'Failed to save bank details');
      }

      setBankMessage('Bank details saved successfully. Station payouts will use this account.');
      setBankForm({ account_holder_name: '', account_number: '', ifsc_code: '', bank_name: '' });
      fetchBankDetails();
    } catch (err: any) {
      setBankMessage(err.message || 'Failed to save bank details');
    } finally {
      setSavingBank(false);
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
      <div className="station-page-header">
        <h1>Earnings & Payouts</h1>
        <p>Track your earnings and payout settlements</p>
      </div>

      {error && (
        <div className="station-badge-danger" style={{ padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="station-grid">
            <div className="station-card">
              <div className="station-stat-header">
                <span className="station-stat-label">Total Earnings</span>
                <div className="station-stat-icon bg-green-soft">Rs</div>
              </div>
              <div className="station-stat-value" style={{ color: '#22c55e' }}>
                Rs {data.station_earnings.total_earnings.toLocaleString('en-IN')}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>Lifetime earnings</p>
            </div>

            <div className="station-card">
              <div className="station-stat-header">
                <span className="station-stat-label">Pending Payout</span>
                <div className="station-stat-icon bg-yellow-soft">P</div>
              </div>
              <div className="station-stat-value" style={{ color: '#eab308' }}>
                Rs {data.station_earnings.pending_payout.toLocaleString('en-IN')}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>Available for settlement</p>
            </div>
          </div>

          <div className="station-card">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.5rem' }}>Earnings Breakdown</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem' }}>Total Transactions</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.summary.total_transactions}</p>
              </div>
              <div style={{ padding: '1.25rem', background: 'rgba(34, 197, 94, 0.05)', borderRadius: '0.75rem', border: '1px solid rgba(34, 197, 94, 0.1)' }}>
                <p style={{ fontSize: '0.8125rem', color: '#22c55e', marginBottom: '0.25rem' }}>Completed</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>Rs {data.summary.completed_earnings.toLocaleString('en-IN')}</p>
              </div>
              <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '0.75rem', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                <p style={{ fontSize: '0.8125rem', color: '#3b82f6', marginBottom: '0.25rem' }}>Settled</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>Rs {data.summary.settled_earnings.toLocaleString('en-IN')}</p>
              </div>
              <div style={{ padding: '1.25rem', background: 'rgba(234, 179, 8, 0.05)', borderRadius: '0.75rem', border: '1px solid rgba(234, 179, 8, 0.1)' }}>
                <p style={{ fontSize: '0.8125rem', color: '#eab308', marginBottom: '0.25rem' }}>Pending</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#eab308' }}>Rs {data.summary.pending_earnings.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>

          <div className="station-card">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Payout Bank Account</h3>
            {bankDetails ? (
              <div style={{ marginBottom: '1rem', padding: '0.85rem', borderRadius: '0.75rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div style={{ fontSize: '0.875rem', color: '#4ade80', marginBottom: '0.35rem' }}>Current linked payout account</div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Account Holder: {bankDetails.account_holder_name}</div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Account: {bankDetails.account_number}</div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>IFSC: {bankDetails.ifsc_code}</div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Bank: {bankDetails.bank_name}</div>
              </div>
            ) : (
              <div style={{ marginBottom: '1rem', padding: '0.85rem', borderRadius: '0.75rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>
                No payout bank account linked yet. Add details below to receive station payouts.
              </div>
            )}

            <form onSubmit={saveBankDetails} style={{ display: 'grid', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="Account Holder Name"
                value={bankForm.account_holder_name}
                onChange={(e) => setBankForm((p) => ({ ...p, account_holder_name: e.target.value }))}
                required
                style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'white' }}
              />
              <input
                type="text"
                placeholder="Account Number"
                value={bankForm.account_number}
                onChange={(e) => setBankForm((p) => ({ ...p, account_number: e.target.value }))}
                required
                style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'white' }}
              />
              <input
                type="text"
                placeholder="IFSC (e.g., HDFC0001234)"
                value={bankForm.ifsc_code}
                onChange={(e) => setBankForm((p) => ({ ...p, ifsc_code: e.target.value }))}
                required
                style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'white', textTransform: 'uppercase' }}
              />
              <input
                type="text"
                placeholder="Bank Name"
                value={bankForm.bank_name}
                onChange={(e) => setBankForm((p) => ({ ...p, bank_name: e.target.value }))}
                required
                style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', color: 'white' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <button
                  type="submit"
                  disabled={savingBank}
                  style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: 'none', background: '#22c55e', color: 'white', fontWeight: 600, cursor: 'pointer' }}
                >
                  {savingBank ? 'Saving...' : bankDetails ? 'Update Bank Details' : 'Save Bank Details'}
                </button>
                {bankMessage && (
                  <span style={{ fontSize: '0.85rem', color: bankMessage.toLowerCase().includes('failed') || bankMessage.toLowerCase().includes('invalid') ? '#f87171' : '#4ade80' }}>
                    {bankMessage}
                  </span>
                )}
              </div>
            </form>
          </div>

          <div className="station-card">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1.5rem' }}>Recent Transactions</h3>

            {data.transactions.length === 0 ? (
              <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No transactions yet</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem', color: '#64748b', fontSize: '0.8125rem', fontWeight: 600 }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '1rem', color: '#64748b', fontSize: '0.8125rem', fontWeight: 600 }}>Amount</th>
                      <th style={{ textAlign: 'left', padding: '1rem', color: '#64748b', fontSize: '0.8125rem', fontWeight: 600 }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '1rem', color: '#64748b', fontSize: '0.8125rem', fontWeight: 600 }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '1rem', color: '#64748b', fontSize: '0.8125rem', fontWeight: 600 }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((transaction) => (
                      <tr key={transaction.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', textTransform: 'capitalize' }}>
                          {transaction.transaction_type.replace(/_/g, ' ')}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 700 }}>
                          Rs {Number(transaction.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <span className={`station-badge ${transaction.status === 'settled'
                            ? 'station-badge-success'
                            : transaction.status === 'pending'
                              ? 'station-badge-warning'
                              : 'station-badge-blue'
                            }`} style={transaction.status === 'completed' ? { background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' } : {}}>
                            {transaction.status}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#94a3b8' }}>
                          {transaction.description}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
                          {new Date(transaction.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
