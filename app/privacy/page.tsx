"use client";

import Link from "next/link";

export default function PrivacyPolicy() {
    return (
        <div className="landing-page login-page" style={{ padding: "4rem 1rem", minHeight: "100vh", overflowY: "auto" }}>
            <div className="login-card" style={{ maxWidth: "800px", width: "100%", textAlign: "left" }}>
                <h1 style={{ color: "#22c55e", marginBottom: "1.5rem" }}>Privacy Policy</h1>
                <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>Last Updated: February 13, 2026</p>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>1. Information We Collect</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        We collect information you provide directly to us, including your name, email address, phone number, vehicle details, and real-time GPS location when you request a service.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>2. How We Use Your Information</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        Your information is used to:
                    </p>
                    <ul style={{ color: "#e5e7eb", lineHeight: "1.8", marginTop: "0.5rem" }}>
                        <li>Dispatch the nearest worker to your location.</li>
                        <li>Communicate service updates and confirmations.</li>
                        <li>Process payments and prevent fraud.</li>
                        <li>Improve our platform and user experience.</li>
                    </ul>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>3. Data Sharing</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        We share your location and contact details with the assigned worker solely for the purpose of fulfilling your service request. We do not sell your personal data to third parties.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>4. Data Security</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        We implement industry-standard security measures to protect your data. However, no method of transmission over the internet is 100% secure.
                    </p>
                </section>

                <section style={{ marginBottom: "2rem" }}>
                    <h2 style={{ color: "#ffffff", fontSize: "1.5rem", marginBottom: "1rem" }}>5. Your Rights</h2>
                    <p style={{ color: "#e5e7eb", lineHeight: "1.6" }}>
                        You have the right to access, update, or delete your personal information through your account settings or by contacting our support team.
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
