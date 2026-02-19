"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<{ first_name: string; last_name: string } | null>(null);


  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("agf_user") : null;
      if (raw) {
        const data = JSON.parse(raw);
        setUser({
          first_name: data.first_name || "User",
          last_name: data.last_name || "",
        });
      }
    } catch (_) {
      setUser({ first_name: "User", last_name: "" });
    }
  }, []);

  const initials = user
    ? `${(user.first_name || "U")[0]}${(user.last_name || "")[0]}`.toUpperCase() || "U"
    : "U";
  const displayName = user ? `${user.first_name} ${user.last_name}`.trim() || "User" : "User";

  return (
    <div className="user-portal">
      <header className="user-header">
        <div className="user-header-inner">
          <Link href="/user" className="user-logo">
            <img src="/favicon.ico" alt="AGF Logo" className="user-logo-img" />
            <span className="user-logo-text">Automotive Grade Fuel</span>
          </Link>
          <div className="user-header-actions">
          </div>
        </div>
      </header>
      <main className="user-main">{children}</main>
    </div>
  );
}
