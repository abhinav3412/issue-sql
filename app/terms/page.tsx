"use client";

import Link from "next/link";

export default function TermsOfService() {
    return (
        <div className="landing-page login-page" style={{ padding: "4rem 1rem", minHeight: "100vh", overflowY: "auto" }}>
            <div className="login-card" style={{ maxWidth: "800px", width: "100%", textAlign: "left" }}>
                <h1 style={{ color: "#22c55e", marginBottom: "1.5rem" }}>Terms of Service</h1>
                <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>Last Updated: February 13, 2026</p>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>1. Acceptance of Terms</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        By accessing or using Automotive Grade Fuel (AGF), you agree to be bound by these Terms of Service. If you do not agree to all of these terms, do not use our services.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>2. Description of Service</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        AGF provides an on-demand platform connecting users with roadside assistance and fuel delivery services. We act as a facilitator and do not directly provide automotive repairs or fuel manufacturing.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>3. User Responsibilities</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        Users are responsible for providing accurate location data and vehicle information. You must ensure your vehicle is in a safe location for service delivery.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>4. Service Fees and Payments</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        Standard service fees apply to all requests. Payments are processed securely. Cancellation fees may apply if a worker has already been dispatched to your location.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>5. Limitation of Liability</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        AGF is not liable for any indirect, incidental, or consequential damages resulting from the use of our services or the actions of third-party workers.
                    </p>
                </section>

                <div style={{ marginTop: "3rem", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1.5rem" }}>
                    <Link href="/signup" className="login-submit" style={{ display: "inline-block", textAlign: "center", textDecoration: "none", width: "auto", padding: "0.75rem 2rem" }}>
                        Back to Sign Up
                    </Link>
                </div>
            </div>
        </div>
    );
}
