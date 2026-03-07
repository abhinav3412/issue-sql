"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("User");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to process request");
      } else {
        setMessage(
          "If an account exists for this email, a password reset link has been sent. Please check your inbox."
        );
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-page">
      <div className="forgot-card forgot-card-enhanced">
        <div className="forgot-kicker">Account recovery</div>
        <h1>Forgot Password</h1>
        <p>Select your account type and enter your email to receive a secure reset link.</p>
        <form onSubmit={handleSubmit} className="forgot-form">
          <label className="forgot-label">Account Type</label>
          <div className="forgot-role-switch" role="radiogroup" aria-label="Account Type">
            <button
              type="button"
              role="radio"
              aria-checked={role === "User"}
              className={`forgot-role-btn ${role === "User" ? "active" : ""}`}
              onClick={() => setRole("User")}
            >
              User
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={role === "Worker"}
              className={`forgot-role-btn ${role === "Worker" ? "active" : ""}`}
              onClick={() => setRole("Worker")}
            >
              Worker
            </button>
          </div>
          <label className="forgot-label">Email Address</label>
          <input
            className="forgot-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          {error && <p className="forgot-error">{error}</p>}
          {message && <p className="forgot-success">{message}</p>}
          <button type="submit" className="forgot-submit" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
        <p className="forgot-signin">
          Remembered?{" "}
          <Link href="/login" className="forgot-signin-link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
