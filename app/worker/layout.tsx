"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WorkerLayout({
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
          first_name: data.first_name || "Worker",
          last_name: data.last_name || "",
        });
      }
    } catch (_) {
      setUser({ first_name: "Worker", last_name: "" });
    }
  }, []);



  return (
    <div className="worker-portal">
      <header className="worker-header">
        <div className="worker-header-inner">
          <Link href="/worker" className="worker-logo">
            <img src="/favicon.ico" alt="AGF Logo" style={{ width: '80px', marginRight: '8px' }} />
            <span className="worker-logo-text">AGF Worker</span>
          </Link>
          <div className="worker-header-actions">
          </div>
        </div>
      </header>
      <main className="worker-main">{children}</main>
    </div>
  );
}
