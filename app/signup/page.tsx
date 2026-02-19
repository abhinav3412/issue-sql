"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COUNTRY_CODES, getFlagEmoji, type CountryOption } from "./countryCodes";
// import workerAvatar from "../../public/worker-avatar.png";
// import userAvatar from "../../public/user-avatar.png";

type RegisterRole = "User" | "Worker";

export default function SignUpPage() {
  const router = useRouter();
  const [role, setRole] = useState<RegisterRole>("User");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: ""
  });
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [error, setError] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(COUNTRY_CODES[0]);
  const countryListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (countryListRef.current && !countryListRef.current.contains(e.target as Node)) {
        setCountryOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!agreeToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy");
      return;
    }

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          role,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: `${selectedCountry.dial}${form.phone.replace(/^\s+|\s+$/g, "")}`,
          password: form.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Failed to create account");
        return;
      }

      // On successful signup, redirect to login
      router.push("/login");
    } catch (err) {
      console.error("Signup request failed", err);
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-card">
        <div className="signup-header">
          <div className="signup-logo">
            <img src="/favicon.ico" alt="AGF Logo" style={{ width: '80px', marginRight: '8px' }} />
            <span className="signup-logo-text">AGF</span>
          </div>
        </div>

        <h1 className="signup-title">Create Account</h1>
        <p className="signup-tagline">Join Automotive Grade Fuel today</p>

        <div className="signup-role-section">
          <label className="signup-role-label">Register As</label>
          <div className="signup-role-cards">
            <button
              type="button"
              className={`signup-role-card ${role === "User" ? "signup-role-card--active" : ""}`}
              onClick={() => setRole("User")}
            >
              <span className="signup-role-card-icon">
                <img className="signup-role-avatar" src="/user-avatar.png" alt="User" />
              </span>
              <span className="signup-role-card-title">User</span>
              <span className="signup-role-card-desc">Request emergency services</span>
            </button>
            <button
              type="button"
              className={`signup-role-card ${role === "Worker" ? "signup-role-card--active" : ""}`}
              onClick={() => setRole("Worker")}
            >
              <span className="signup-role-card-icon">
                <img className="signup-role-avatar" src="/worker-avatar.png" alt="Worker" />
              </span>
              <span className="signup-role-card-title">Worker</span>
              <span className="signup-role-card-desc">Provide roadside assistance</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="signup-form">
          <div className="signup-row">
            <div className="signup-field">
              <label className="signup-label">First Name</label>
              <input
                className="signup-input"
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                placeholder="Enter first name"
                required
              />
            </div>
            <div className="signup-field">
              <label className="signup-label">Last Name</label>
              <input
                className="signup-input"
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                placeholder="Enter last name"
                required
              />
            </div>
          </div>

          <div className="signup-field">
            <label className="signup-label">Email Address</label>
            <input
              className="signup-input"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="signup-field signup-phone-field">
            <label className="signup-label">Phone Number</label>
            <div className="signup-phone-wrap" ref={countryListRef}>
              <button
                type="button"
                className="signup-country-trigger"
                onClick={() => setCountryOpen((o) => !o)}
                aria-expanded={countryOpen}
                aria-haspopup="listbox"
                aria-label="Country code"
              >
                <span className="signup-country-flag">{getFlagEmoji(selectedCountry.iso2)}</span>
                <span className="signup-country-dial">{selectedCountry.dial}</span>
                <span className="signup-country-chevron">{countryOpen ? "▲" : "▼"}</span>
              </button>
              {countryOpen && (
                <div className="signup-country-dropdown" role="listbox">
                  <div className="signup-country-list">
                    {COUNTRY_CODES.map((c) => (
                      <button
                        key={c.iso2 + c.dial}
                        type="button"
                        role="option"
                        aria-selected={selectedCountry.iso2 === c.iso2 && selectedCountry.dial === c.dial}
                        className={`signup-country-option ${selectedCountry.iso2 === c.iso2 && selectedCountry.dial === c.dial ? "signup-country-option--active" : ""}`}
                        onClick={() => {
                          setSelectedCountry(c);
                          setCountryOpen(false);
                        }}
                      >
                        <span className="signup-country-option-flag">{getFlagEmoji(c.iso2)}</span>
                        <span className="signup-country-option-name">{c.name}</span>
                        <span className="signup-country-option-dial">{c.dial}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <input
                className="signup-input signup-phone-input"
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="Phone number"
                required
              />
            </div>
          </div>

          <div className="signup-row">
            <div className="signup-field">
              <label className="signup-label">Password</label>
              <input
                className="signup-input"
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Create password"
                required
              />
            </div>
            <div className="signup-field">
              <label className="signup-label">Confirm Password</label>
              <input
                className="signup-input"
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm password"
                required
              />
            </div>
          </div>

          <div className="signup-terms">
            <label className="signup-checkbox-label">
              <input
                type="checkbox"
                checked={agreeToTerms}
                onChange={(e) => setAgreeToTerms(e.target.checked)}
                className="signup-checkbox"
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" className="signup-link">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="signup-link">
                  Privacy Policy
                </Link>
              </span>
            </label>
          </div>

          {error && <p className="signup-error">{error}</p>}

          <button type="submit" className="signup-submit">
            Create Account
          </button>
        </form>

        <p className="signup-login-link">
          Already have an account?{" "}
          <Link href="/login" className="signup-link">
            Sign in
          </Link>
        </p>

        <Link href="/" className="signup-back">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
