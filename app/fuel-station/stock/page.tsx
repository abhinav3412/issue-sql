'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, getAuthHeaders } from '@/app/utils/authGuard';

interface Stock {
  id: number;
  fuel_type: string;
  stock_litres: number;
  last_refilled_at: string;
  updated_at: string;
}

export default function StockManagement() {
  const user = getCurrentUser();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!user) return;
    fetchStocks();
  }, [user?.id]);

  const fetchStocks = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/fuel-station/stock?fuel_station_id=${user?.id}`,
        { headers: getAuthHeaders() }
      );

      if (!response.ok) throw new Error('Failed to fetch stocks');

      const data = await response.json();
      if (data.success) {
        setStocks(data.stocks);
        // Initialize edit values with current stock levels
        const newEditValues: Record<number, number> = {};
        data.stocks.forEach((stock: Stock) => {
          newEditValues[stock.id] = stock.stock_litres;
        });
        setEditValues(newEditValues);
      }
    } catch (err) {
      setError('Failed to load stock data');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStock = async (stock: Stock) => {
    try {
      setError('');
      setSuccess('');

      const newStock = editValues[stock.id];
      if (newStock === undefined) return;

      const response = await fetch('/api/fuel-station/stock', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          fuel_station_id: user?.id,
          fuel_type: stock.fuel_type,
          stock_litres: newStock,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to update stock');
        return;
      }

      setSuccess(`${stock.fuel_type} stock updated successfully`);
      setEditingId(null);
      setTimeout(() => fetchStocks(), 500);
    } catch (err) {
      setError('Error updating stock');
      console.error(err);
    }
  };

  if (!user) {
    return <div className="text-center py-8">Please login first</div>;
  }

  return (
    <div className="station-content">
      {/* Header */}
      <div className="station-page-header">
        <h1>Stock Management</h1>
        <p>Update your petrol and diesel stock levels</p>
      </div>

      {/* Messages */}
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

      {/* Stock Cards */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          <div className="animate-spin" style={{ width: '40px', height: '40px', border: '4px solid rgba(59, 130, 246, 0.2)', borderTopColor: '#3b82f6', borderRadius: '50%' }}></div>
        </div>
      ) : stocks.length === 0 ? (
        <div className="station-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#64748b' }}>No stock records found</p>
        </div>
      ) : (
        <div className="station-card-grid">
          {stocks.map((stock) => (
            <div key={stock.id} className="station-card">
              {/* Fuel Type Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ textTransform: 'capitalize', fontSize: '1.25rem', fontWeight: 700 }}>
                  {stock.fuel_type === 'petrol' ? '⛽ Petrol' : '⛽ Diesel'}
                </h3>
                <span className={`station-badge ${stock.stock_litres > 500
                  ? 'station-badge-success'
                  : stock.stock_litres > 200
                    ? 'station-badge-warning'
                    : 'station-badge-danger'
                  }`}>
                  {stock.stock_litres > 0 ? 'In Stock' : 'Low Stock'}
                </span>
              </div>

              {/* Current Stock Display */}
              {editingId !== stock.id ? (
                <>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Current Stock</p>
                    <p style={{ fontSize: '2.5rem', fontWeight: 800 }}>{stock.stock_litres}L</p>
                  </div>

                  <div style={{ marginBottom: '1.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                    <p>Last updated: {new Date(stock.updated_at).toLocaleString()}</p>
                  </div>

                  <button
                    onClick={() => setEditingId(stock.id)}
                    className="station-btn station-btn-primary"
                    style={{ width: '100%' }}
                  >
                    Update Stock
                  </button>
                </>
              ) : (
                <>
                  {/* Edit Form */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem' }}>
                      New Stock Level (Litres)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={editValues[stock.id] || 0}
                      onChange={(e) =>
                        setEditValues({
                          ...editValues,
                          [stock.id]: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="station-input"
                      style={{ fontSize: '1.25rem', fontWeight: 700 }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      onClick={() => handleUpdateStock(stock)}
                      className="station-btn station-btn-success"
                      style={{ flex: 1 }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditValues({ ...editValues, [stock.id]: stock.stock_litres });
                      }}
                      className="station-btn station-btn-secondary"
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stock Management Tips */}
      <div className="station-info-box">
        <h3 style={{ fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>💡</span> Tips for Stock Management
        </h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
          <li>✓ Keep stock levels up to date for accurate order fulfillment</li>
          <li>✓ Monitor low stock warnings to avoid service disruptions</li>
          <li>✓ Stock decreases automatically when orders are completed</li>
          <li>✓ Maintain minimum stock levels to handle peak demand</li>
        </ul>
      </div>
    </div>
  );
}
