"use client";

import Link from "next/link";
// import adminAvatar from "../../public/admin-avatar.png";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-portal">
      <header className="admin-header">
        <div className="admin-header-inner">
          <Link href="/admin" className="admin-logo">
            <img src="/favicon.ico" alt="AGF Logo" className="admin-logo-img" />
            <span className="admin-logo-text">AGF Admin</span>
          </Link>
          <div className="admin-header-actions">
            <div className="admin-user">
              <img className="admin-avatar" src="/admin-avatar.png" alt="Admin" />
              <span className="admin-name">Admin</span>
            </div>
            <Link href="/login" className="admin-logout-btn">
              Logout
            </Link>
          </div>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
