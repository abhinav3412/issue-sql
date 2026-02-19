'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, clearAuth, getUserFullName } from '@/app/utils/authGuard';

export default function FuelStationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(getCurrentUser());
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || (currentUser.role !== 'Station' && currentUser.role !== 'Fuel_Station')) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
    setIsLoading(false);
  }, [router]);

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const navItems = [
    { href: '/fuel-station', label: 'Dashboard', icon: '📊' },
    { href: '/fuel-station/stock', label: 'Stock Management', icon: '📦' },
    { href: '/fuel-station/earnings', label: 'Earnings & Payouts', icon: '💰' },
    { href: '/fuel-station/cod-settings', label: 'COD Settings', icon: '⚙️' },
    { href: '/fuel-station/transactions', label: 'Transactions', icon: '📝' },
  ];

  const isActive = (href: string) => {
    if (href === '/fuel-station') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="station-portal">
      {/* Header */}
      <header className="station-header">
        <div className="station-header-inner">
          <Link href="/fuel-station" className="station-logo">
            <div className="station-logo-icon">⛽</div>
            <div>
              <span className="station-logo-text" style={{ display: 'block' }}>Fuel Station</span>
              <span className="station-name-sub" style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {user.station_name || 'Management'}
              </span>
            </div>
          </Link>

          <div className="station-header-actions">
            <div className="station-user">
              <span className="station-name">{getUserFullName()}</span>
            </div>
            <button onClick={handleLogout} className="station-logout-btn">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="station-layout-body">
        {/* Sidebar */}
        <aside className="station-sidebar">
          <nav style={{ display: 'flex', flexDirection: 'inherit', gap: 'inherit' }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`station-nav-item ${isActive(item.href) ? 'station-nav-item--active' : ''}`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="station-main">
          {children}
        </main>
      </div>
    </div>
  );
}
