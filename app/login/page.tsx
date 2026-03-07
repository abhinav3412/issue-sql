"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
// import workerAvatar from "../../public/worker-avatar.png";
// import adminAvatar from "../../public/admin-avatar.png";
// import userAvatar from "../../public/user-avatar.png";

type Role = "User" | "Worker" | "Admin";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: role || "Station",
          email: form.email,
          password: form.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Invalid credentials");
        return;
      }

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("agf_user", JSON.stringify({
            id: data.id,
            role: data.role,
            email: data.email || form.email,
            first_name: data.first_name || "User",
            last_name: data.last_name || "",
            phone_number: data.phone_number || "",
            driving_licence: data.driving_licence || "",
            station_name: data.station_name || "",
            is_verified: data.is_verified || false,
            cod_enabled: data.cod_enabled || false,
          }));
          if (data.token) {
            localStorage.setItem("agf_token", data.token);
          }
        } catch (_) { }
      }

      if (data.role === "Admin") {
        router.push("/admin");
      } else if (data.role === "Worker") {
        router.push("/worker");
      } else if (data.role === "Station" || data.role === "Fuel_Station") {
        router.push("/fuel-station");
      } else {
        router.push("/user");
      }
    } catch (err) {
      console.error("Login request failed", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-header">
        <div className="login-logo">
          <img src="/favicon.ico" alt="AGF Logo" className="login-logo-img" />
          <span className="login-logo-text">AGF</span>
        </div>
      </div>

      <div className="login-card">
        <h1 className="login-welcome">Welcome Back</h1>
        <p className="login-subtitle">Sign in to access your account</p>

        <div className="login-role-section">
          <label className="login-role-label">Login As</label>
          <div className="login-role-buttons">
            <button
              type="button"
              className={`login-role-btn ${role === "User" ? "login-role-btn--active" : ""}`}
              onClick={() => setRole("User")}
            >
              <span className="login-role-icon">
                <img className="login-role-avatar" src="/user-avatar.png" alt="User" />
              </span>
              <span>User</span>
            </button>
            <button
              type="button"
              className={`login-role-btn ${role === "Worker" ? "login-role-btn--active" : ""}`}
              onClick={() => setRole("Worker")}
            >
              <span className="login-role-icon">
                <img className="login-role-avatar" src="/worker-avatar.png" alt="Worker" />
              </span>
              <span>Worker</span>
            </button>
            <button
              type="button"
              className={`login-role-btn ${role === "Admin" ? "login-role-btn--active" : ""}`}
              onClick={() => setRole("Admin")}
            >
              <span className="login-role-icon">
                <img className="login-role-avatar" src="/admin-avatar.png" alt="Admin" />
              </span>
              <span>Admin</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label className="login-label">Email Address</label>
            <input
              className="login-input"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <input
              className="login-input"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Enter your password"
              required
            />
          </div>

          <div className="login-options">
            <label className="login-checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="login-checkbox"
              />
              <span>Remember me</span>
            </label>
            <Link href="/forgot-password" title="reset password" className="login-forgot">
              Forgot password?
            </Link>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>

        <p className="login-signup">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="login-signup-link">
            Sign up
          </Link>
        </p>
      </div>

      <Link href="/" className="login-back">
        ← Back to Home
      </Link>
    </div>
  );
}
