"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import GradientText from "./GradientText";
import SpotlightCard from "./SpotlightCard";
import BackgroundPaths from "./BackgroundPaths";


export default function HomePage() {
  return (
    <div className="landing-page">
      {/* Header */}
      <header className="landing-header">
        <div className="landing-container">
          <div className="landing-logo">
            <img src="/favicon.ico" alt="AGF Logo" className="landing-logo-img" />
            <GradientText
              colors={["#22c55e", "#16a34a", "#22c55e", "#16a34a", "#22c55e"]}
              animationSpeed={6}
              showBorder={false}
              className="landing-logo-text"
            >
              Automotive Grade Fuel
            </GradientText>
          </div>
          <nav className="landing-nav">
            <Link href="#services" className="landing-nav-link">
              Services
            </Link>
            <Link href="#how-it-works" className="landing-nav-link">
              How It Works
            </Link>
            <Link href="#features" className="landing-nav-link">
              Features
            </Link>
            <Link href="/login" className="landing-cta-header">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <BackgroundPaths />
        <div className="landing-hero-overlay" />
        <motion.div
          className="landing-hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h1 className="landing-hero-title">
            <GradientText
              colors={["#22c55e", "#5227FF", "#FF9FFC", "#22c55e"]}
              animationSpeed={10}
              showBorder={false}
              className="hero-gradient-text"
            >
              Never Run Out of Fuel Again
            </GradientText>
          </h1>
          <motion.p
            className="landing-hero-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Emergency fuel delivery, mechanic services, and EV charging assistance
            available 24/7 in remote and urban areas
          </motion.p>
          <motion.div
            className="landing-hero-buttons"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <Link href="/signup" className="landing-btn landing-btn--primary">
              Request Service Now
            </Link>
            <Link href="#how-it-works" className="landing-btn landing-btn--secondary">
              Learn More
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Our Services Section */}
      <section id="services" className="landing-section landing-services">
        <div className="landing-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="landing-section-title">Our Services</h2>
            <p className="landing-section-subtitle">
              Comprehensive roadside assistance and fuel delivery services powered by
              real-time AI technology
            </p>
          </motion.div>
          <div className="landing-services-grid">
            {[
              { icon: "⛽", title: "Emergency Fuel Delivery", desc: "Get fuel delivered to your location within minutes, even in remote forest areas." },
              { icon: "🔌", title: "EV Charging Assistance", desc: "Mobile EV charging units available for electric vehicles stranded without power." },
              { icon: "🔧", title: "Mechanic Services", desc: "Professional mechanics dispatched to your location for on-site vehicle repairs." },
              { icon: "⚡", title: "Electrical Repairs", desc: "Expert electrical diagnostics and repairs for all vehicle electrical system issues." },
              { icon: "🛞", title: "Puncture Repair", desc: "Quick tire puncture repairs and replacements to get you back on the road safely." },
              { icon: "📍", title: "Real-Time Tracking", desc: "Track your service request and worker location in real-time with live GPS updates." }
            ].map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <SpotlightCard className="landing-service-card">
                  <div className="landing-service-icon">{service.icon}</div>
                  <h3 className="landing-service-title">{service.title}</h3>
                  <p className="landing-service-desc">{service.desc}</p>
                </SpotlightCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="landing-section landing-how-it-works">
        <div className="landing-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="landing-section-title">How It Works</h2>
            <p className="landing-section-subtitle">Get help in three simple steps</p>
          </motion.div>
          <div className="landing-steps">
            {[
              { icon: "📱", num: "01", title: "Request Service", desc: "Open the app and select the service you need. Share your location instantly." },
              { icon: "🧭", num: "02", title: "Worker Assigned", desc: "The nearest available worker is assigned to your request with real-time tracking." },
              { icon: "✅", num: "03", title: "Service Delivered", desc: "Receive professional service at your location with transparent updates." }
            ].map((step, index) => (
              <motion.div
                className="landing-step"
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
              >
                <div className="landing-step-icon-wrapper">
                  <div className="landing-step-icon">{step.icon}</div>
                  <div className="landing-step-number">{step.num}</div>
                </div>
                <h3 className="landing-step-title">{step.title}</h3>
                <p className="landing-step-desc">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Advanced Technology Section */}
      <section id="features" className="landing-section landing-technology">
        <div className="landing-container landing-technology-container">
          <motion.div
            className="landing-technology-content"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="landing-technology-title">
              Advanced Technology for Reliable Service
            </h2>
            <p className="landing-technology-desc">
              Our cloud-based platform uses IoT sensors and real-time data to ensure
              you never get stranded.
            </p>
            <div className="landing-features">
              {[
                { icon: "☁️", title: "Cloud Technology", desc: "Real-time updates on fuel availability and service worker locations." },
                { icon: "📡", title: "IoT Monitoring", desc: "Monitor and predict fuel stock levels at remote and urban stations." },
                { icon: "🔄", title: "Transparent Updates", desc: "Get instant notifications and real-time updates on your request status." },
                { icon: "👤", title: "User-Friendly Interface", desc: "Intuitive design makes requesting services quick and easy." }
              ].map((feat, index) => (
                <motion.div
                  className="landing-feature"
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + (index * 0.1) }}
                >
                  <span className="landing-feature-icon">{feat.icon}</span>
                  <div>
                    <h4 className="landing-feature-title">{feat.title}</h4>
                    <p className="landing-feature-desc">{feat.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
          <motion.div
            className="landing-technology-visual"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="landing-phone-mockup">
              <div className="landing-phone-screen">
                <motion.div
                  className="phone-logo-container"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <motion.img
                    src="/favicon.ico"
                    alt="AGF Logo"
                    className="phone-logo-img"
                    animate={{
                      y: [0, -10, 0],
                      rotate: [0, 2, -2, 0]
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                  <motion.div
                    animate={{
                      opacity: [0.6, 1, 0.6]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="phone-glow"
                  />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Ready to Get Started Section */}
      <section className="landing-section landing-cta-section">
        <motion.div
          className="landing-container"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="landing-cta-title">Ready to Get Started?</h2>
          <p className="landing-cta-subtitle">
            Join thousands of drivers who trust Automotive Grade Fuel for emergency
            roadside assistance
          </p>
          <Link href="/signup" className="landing-cta-button">
            Create Your Account
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-container">
          <motion.div
            className="landing-footer-brand"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="landing-footer-logo">
              <img src="/favicon.ico" alt="AGF Logo" className="landing-footer-logo-img" />
              <span className="landing-footer-logo-text">AGF</span>
            </div>
            <p className="landing-footer-desc">
              Emergency fuel delivery and roadside assistance available 24/7
            </p>
            <p className="landing-footer-copyright">
              © {new Date().getFullYear()} Automotive Grade Fuel. All rights reserved.
            </p>
          </motion.div>
          <div className="landing-footer-links">
            <div className="landing-footer-column">
              <h4 className="landing-footer-heading">Services</h4>
              <Link href="#" className="landing-footer-link">
                Fuel Delivery
              </Link>
              <Link href="#" className="landing-footer-link">
                EV Charging
              </Link>
              <Link href="#" className="landing-footer-link">
                Mechanic Services
              </Link>
              <Link href="#" className="landing-footer-link">
                Electrical Repairs
              </Link>
            </div>
            <div className="landing-footer-column">
              <h4 className="landing-footer-heading">Company</h4>
              <Link href="#" className="landing-footer-link">
                About Us
              </Link>
              <Link href="#" className="landing-footer-link">
                Careers
              </Link>
              <Link href="#" className="landing-footer-link">
                Contact
              </Link>
              <Link href="/terms" className="landing-footer-link">
                Terms of Service
              </Link>
              <Link href="/privacy" className="landing-footer-link">
                Privacy Policy
              </Link>
              <Link href="#" className="landing-footer-link">
                Support
              </Link>
            </div>
          </div>
          <div className="landing-footer-social">
            <h4 className="landing-footer-heading">Connect</h4>
            <div className="landing-social-icons">
              <a href="#" className="landing-social-icon" aria-label="Facebook">
                📘
              </a>
              <a href="#" className="landing-social-icon" aria-label="Twitter">
                🐦
              </a>
              <a href="#" className="landing-social-icon" aria-label="Instagram">
                📷
              </a>
            </div>
            <a href="mailto:AGF@gmail.com" className="landing-footer-chat">
              💬 Talk with us
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
