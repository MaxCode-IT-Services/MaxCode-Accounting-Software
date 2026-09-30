import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { verifyServerSession } from "./utils/api";
import {
  getDefaultDashboardRoute,
  getFirstAllowedRoute,
  getStoredUserInfo,
} from "./utils/permissions";

const PrivacyPolicy = () => {
  const [scrolled, setScrolled] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const authenticated = await verifyServerSession();
      if (!mounted) return;
      setIsLoggedIn(authenticated === true);
    };
    checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  const primaryCtaPath = (() => {
    if (!isLoggedIn) return "/login";
    const userInfo = getStoredUserInfo();
    const firstAllowedRoute = getFirstAllowedRoute(userInfo);
    if (firstAllowedRoute && firstAllowedRoute !== "/login") {
      return firstAllowedRoute;
    }
    return getDefaultDashboardRoute(userInfo);
  })();

  return (
    <div className="pp-page">
      {/* NAVBAR */}
      <nav
        className={`navbar navbar-expand-lg fixed-top py-3 pp-navbar ${
          scrolled ? "scrolled" : ""
        }`}
      >
        <div className="container">
          <Link className="navbar-brand" to="/">
            <img src="Logo.png" alt="MaxCode" style={{ width: "180px" }} />
          </Link>
          <div className="d-none d-lg-flex align-items-center ms-auto gap-2">
            <Link className="pp-nav-link active" to="/privacy-policy">
              Privacy Policy
            </Link>
            <Link
              to={primaryCtaPath}
              className={`btn ${
                isLoggedIn ? "btn-success" : "btn-outline-success"
              } rounded-pill px-4 fw-semibold`}
            >
              {isLoggedIn ? "Dashboard" : "Login"}
            </Link>
          </div>
          <Link
            to="/"
            className="btn btn-outline-success btn-sm rounded-pill d-lg-none"
          >
            <i className="fas fa-arrow-left me-2"></i>Back
          </Link>
        </div>
      </nav>

      {/* PAGE HEADER */}
      <header className="pp-hero">
        <div className="pp-bg-grid" aria-hidden="true"></div>
        <div className="pp-orb pp-orb-1" aria-hidden="true"></div>
        <div className="pp-orb pp-orb-2" aria-hidden="true"></div>
        <div className="container position-relative">
          <span className="section-tag">LEGAL</span>
          <h1 className="pp-title">
            Privacy <span className="pp-grad-text">Policy</span>
          </h1>
          <p className="pp-subtitle">
            How MaxCode Telegram Webhook Router collects, uses and protects
            your information.
          </p>
          <div className="pp-meta">
            <span>
              <i className="fas fa-calendar me-2"></i>Effective Date: February
              28, 2026
            </span>
            <span>
              <i className="fas fa-building me-2"></i>MaxCode IT Services
            </span>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <section className="pp-content-section">
        <div className="container">
          <div className="pp-card">
            <p className="pp-intro">
              This Privacy Policy explains how MaxCode Accounting Software
              ("we", "us", or "our") collects, uses, and protects your
              information when you use our software.
            </p>

            <div className="pp-block">
              <div className="pp-section-head">
                <span className="pp-num">01</span>
                <h4 className="pp-section-title">
                  <i className="fas fa-database"></i> Information We Collect
                </h4>
              </div>
              <ul className="pp-list">
                <li>
                  Personal information you provide (such as name, email,
                  company details).
                </li>
                <li>Usage data and analytics to improve our services.</li>
                <li>
                  Data entered for accounting and business management purposes.
                </li>
              </ul>
            </div>

            <div className="pp-block">
              <div className="pp-section-head">
                <span className="pp-num">02</span>
                <h4 className="pp-section-title">
                  <i className="fas fa-sliders"></i> How We Use Your Information
                </h4>
              </div>
              <ul className="pp-list">
                <li>To provide and maintain the software features.</li>
                <li>To communicate updates, support, and important notices.</li>
                <li>To improve user experience and software performance.</li>
              </ul>
            </div>

            <div className="pp-block">
              <div className="pp-section-head">
                <span className="pp-num">03</span>
                <h4 className="pp-section-title">
                  <i className="fas fa-shield-halved"></i> Data Security
                </h4>
              </div>
              <p className="pp-text">
                We implement industry-standard security measures to protect
                your data. However, no method of transmission or storage is
                100% secure.
              </p>
            </div>

            <div className="pp-block">
              <div className="pp-section-head">
                <span className="pp-num">04</span>
                <h4 className="pp-section-title">
                  <i className="fas fa-share-nodes"></i> Data Sharing
                </h4>
              </div>
              <p className="pp-text">
                We do not sell or share your personal information with third
                parties except as required by law or with your explicit
                consent.
              </p>
            </div>

            <div className="pp-block">
              <div className="pp-section-head">
                <span className="pp-num">05</span>
                <h4 className="pp-section-title">
                  <i className="fas fa-user-shield"></i> Your Rights
                </h4>
              </div>
              <ul className="pp-list">
                <li>
                  You can request access, correction, or deletion of your
                  personal data.
                </li>
                <li>Contact us for any privacy-related concerns.</li>
              </ul>
            </div>

            <div className="pp-block">
              <div className="pp-section-head">
                <span className="pp-num">06</span>
                <h4 className="pp-section-title">
                  <i className="fas fa-rotate"></i> Changes to This Policy
                </h4>
              </div>
              <p className="pp-text">
                We may update this Privacy Policy from time to time. Changes
                will be posted on this page with the updated effective date.
              </p>
            </div>

            <div className="pp-block pp-block-last">
              <div className="pp-section-head">
                <span className="pp-num">07</span>
                <h4 className="pp-section-title">
                  <i className="fas fa-envelope"></i> Contact Us
                </h4>
              </div>
              <p className="pp-text">
                For questions or concerns about this Privacy Policy, feel free
                to reach out to us anytime.
              </p>
              <a
                className="pp-contact-link"
                href="mailto:contact@maxcode.in"
              >
                <i className="fas fa-paper-plane"></i> contact@maxcode.in
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="footer" className="footer-section">
        <div className="footer-bg-checks" aria-hidden="true"></div>
        <div className="footer-bubbles" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="footer-bubble"></span>
          ))}
        </div>
        <div className="container">
          <div className="row g-4 mb-4">
            <div className="col-lg-4">
              <img src="Logo.png" alt="MaxCode" style={{ width: "180px" }} />
              <p className="footer-text mt-3 mb-3">
                MaxCode Telegram Webhook Router — a multi-tenant bot management
                platform with signed forwarding, smart filters and complete
                audit logs.
              </p>
              <div className="d-flex gap-2">
                <a href="#" className="social-icon" aria-label="facebook">
                  <i className="fab fa-facebook-f"></i>
                </a>
                <a href="#" className="social-icon" aria-label="instagram">
                  <i className="fab fa-instagram"></i>
                </a>
                <a href="#" className="social-icon" aria-label="linkedin">
                  <i className="fab fa-linkedin-in"></i>
                </a>
              </div>
            </div>

            <div className="col-sm-6 col-lg-2">
              <h6 className="footer-title">Product</h6>
              <ul className="footer-links">
                <li>
                  <Link to="/privacy-policy">Privacy Policy</Link>
                </li>
                <li>
                  <a href="/#features">Features</a>
                </li>
                <li>
                  <a href="/#workflow">Workflow</a>
                </li>
                <li>
                  <a href="/#security">Security</a>
                </li>
                <li>
                  <a href="/#pricing">Pricing</a>
                </li>
              </ul>
            </div>

            <div className="col-sm-6 col-lg-3">
              <h6 className="footer-title">Key Capabilities</h6>
              <ul className="footer-links">
                <li>Multi-Bot Management</li>
                <li>Smart Update Routing</li>
                <li>HMAC-Signed Delivery</li>
                <li>Live Message Logs</li>
              </ul>
            </div>

            <div className="col-lg-3">
              <h6 className="footer-title">Contact</h6>
              <ul className="footer-links">
                <li>
                  <i className="fas fa-envelope me-2"></i> contact@maxcode.in
                </li>
                <li>
                  <i className="fas fa-globe me-2"></i> www.maxcode.in
                </li>
                <li>
                  <i className="fas fa-phone me-2"></i> +91 6377241446
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom d-flex justify-content-center">
            <p className="mb-0 text-center">
              © {new Date().getFullYear()} MaxCode IT Services . All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>

      <style>{`
        /* BASE */
        .pp-page {
          color: #1f2937;
          background: #ffffff;
          overflow-x: hidden;
        }

        /* NAVBAR */
        .pp-navbar {
          transition: all 0.25s ease;
          background: transparent;
          border-bottom: 1px solid transparent;
        }

        .pp-navbar.scrolled {
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(14px) saturate(1.4);
          -webkit-backdrop-filter: blur(14px) saturate(1.4);
          border-bottom: 1px solid #eef2f6;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.07);
        }

        .pp-nav-link {
          font-weight: 700;
          color: #0f172a;
          text-decoration: none;
          padding: 6px 14px;
          border-radius: 999px;
        }

        .pp-nav-link.active,
        .pp-nav-link:hover {
          color: #007026;
          background: rgba(0, 112, 38, 0.08);
        }

        /* HEADER */
        .pp-hero {
          position: relative;
          overflow: hidden;
          padding: 150px 0 70px;
          text-align: center;
          background:
            radial-gradient(900px 420px at 85% -10%, rgba(0, 112, 38, 0.08), transparent 60%),
            radial-gradient(700px 380px at -10% 40%, rgba(14, 116, 144, 0.07), transparent 60%),
            linear-gradient(180deg, #f6fbf7 0%, #ffffff 100%);
        }

        .pp-bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0, 112, 38, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 112, 38, 0.05) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse 75% 65% at 50% 25%, black 35%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 75% 65% at 50% 25%, black 35%, transparent 100%);
          pointer-events: none;
        }

        .pp-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.55;
          pointer-events: none;
        }

        .pp-orb-1 {
          width: 360px;
          height: 360px;
          top: -90px;
          right: -70px;
          background: radial-gradient(circle, rgba(0, 112, 38, 0.22), transparent 70%);
        }

        .pp-orb-2 {
          width: 300px;
          height: 300px;
          bottom: -60px;
          left: -110px;
          background: radial-gradient(circle, rgba(14, 116, 144, 0.16), transparent 70%);
        }

        .section-tag {
          display: inline-block;
          padding: 6px 16px;
          border-radius: 999px;
          background: #ffffff;
          border: 1.5px dashed rgba(0, 112, 38, 0.4);
          color: #007026;
          font-weight: 800;
          font-size: 0.72rem;
          letter-spacing: 1.4px;
          margin-bottom: 14px;
        }

        .pp-title {
          font-weight: 800;
          font-size: clamp(2rem, 4.5vw, 3rem);
          letter-spacing: -0.5px;
          margin-bottom: 12px;
        }

        .pp-grad-text {
          background: linear-gradient(135deg, #007026, #0e9f5c);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .pp-subtitle {
          color: #6b7280;
          max-width: 560px;
          margin: 0 auto 18px;
        }

        .pp-meta {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 10px 22px;
          color: #475569;
          font-size: 0.88rem;
          font-weight: 600;
        }

        .pp-meta i {
          color: #007026;
        }

        /* CONTENT CARD */
        .pp-content-section {
          padding: 40px 0 90px;
          background: #ffffff;
        }

        .pp-card {
          background: #ffffff;
          border: 1.5px solid #e8edf2;
          border-radius: 22px;
          padding: 40px;
          max-width: 860px;
          margin: 0 auto;
          box-shadow: 0 18px 44px rgba(15, 23, 42, 0.07);
        }

        .pp-intro {
          color: #334155;
          font-size: 17px;
          line-height: 1.75;
          margin: 0 0 26px;
          padding: 16px 20px;
          background: linear-gradient(135deg, rgba(0, 112, 38, 0.05), rgba(14, 116, 144, 0.04));
          border: 1.5px dashed #cfe4d6;
          border-radius: 14px;
        }

        .pp-block {
          position: relative;
          padding: 22px 0 24px;
          border-top: 1.5px dashed #e2ede6;
        }

        .pp-block:first-of-type {
          border-top: none;
          padding-top: 0;
        }

        .pp-block-last {
          padding-bottom: 0;
        }

        .pp-section-head {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
        }

        .pp-num {
          flex: 0 0 auto;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 13px;
          background: linear-gradient(135deg, #007026, #0e9f5c);
          color: #ffffff;
          font-weight: 800;
          font-size: 0.85rem;
          letter-spacing: 0.5px;
          box-shadow: 0 8px 18px rgba(0, 112, 38, 0.22);
        }

        .pp-section-title {
          margin: 0;
          font-weight: 800;
          font-size: 1.15rem;
          color: #0f172a;
          letter-spacing: -0.2px;
        }

        .pp-section-title i {
          color: #007026;
          margin-right: 8px;
          font-size: 1rem;
        }

        .pp-text {
          color: #334155;
          font-size: 15px;
          line-height: 1.75;
          margin: 0 0 6px;
        }

        .pp-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .pp-list li {
          position: relative;
          padding: 6px 0 6px 26px;
          color: #334155;
          font-size: 15px;
          line-height: 1.7;
        }

        .pp-list li::before {
          content: "\\f00c";
          font-family: "Font Awesome 6 Free";
          font-weight: 900;
          position: absolute;
          left: 0;
          top: 8px;
          width: 17px;
          height: 17px;
          border-radius: 6px;
          background: rgba(0, 112, 38, 0.1);
          color: #007026;
          font-size: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pp-contact-link {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          margin-top: 6px;
          padding: 11px 22px;
          border-radius: 999px;
          background: linear-gradient(135deg, #007026, #0e9f5c);
          color: #ffffff;
          font-weight: 700;
          font-size: 0.95rem;
          text-decoration: none;
          box-shadow: 0 10px 24px rgba(0, 112, 38, 0.25);
          transition: all 0.25s ease;
        }

        .pp-contact-link:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(0, 112, 38, 0.32);
          color: #ffffff;
        }

        .pp-card h4 {
          scroll-margin-top: 110px;
        }

        /* FOOTER — same theme as home */
        .footer-section {
          position: relative;
          background:
            radial-gradient(700px 300px at 85% 0%, rgba(0, 112, 38, 0.07), transparent 65%),
            radial-gradient(600px 280px at 0% 100%, rgba(14, 116, 144, 0.06), transparent 65%),
            linear-gradient(180deg, #f4faf6 0%, #eef7f1 100%);
          border-top: 1.5px dashed #cfe4d6;
          padding: 60px 0 30px;
          overflow: hidden;
        }

        .footer-bg-checks {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0, 112, 38, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 112, 38, 0.06) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: linear-gradient(180deg, transparent, black 45%, black 100%);
          -webkit-mask-image: linear-gradient(180deg, transparent, black 45%, black 100%);
          pointer-events: none;
        }

        .footer-bubbles {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .footer-bubble {
          position: absolute;
          bottom: -70px;
          border-radius: 50%;
          background: radial-gradient(
            circle at 32% 30%,
            rgba(255, 255, 255, 0.85),
            rgba(14, 159, 92, 0.16) 55%,
            rgba(0, 112, 38, 0.1)
          );
          border: 1px solid rgba(0, 112, 38, 0.16);
          box-shadow: inset 0 0 10px rgba(0, 112, 38, 0.08);
          opacity: 0;
          animation: bubbleRise linear infinite;
        }

        .footer-bubble:nth-child(1) { left: 4%; width: 26px; height: 26px; animation-duration: 13s; animation-delay: -2s; }
        .footer-bubble:nth-child(2) { left: 13%; width: 14px; height: 14px; animation-duration: 10s; animation-delay: -6s; }
        .footer-bubble:nth-child(3) { left: 22%; width: 34px; height: 34px; animation-duration: 16s; animation-delay: -9s; }
        .footer-bubble:nth-child(4) { left: 31%; width: 12px; height: 12px; animation-duration: 9s; animation-delay: -4s; }
        .footer-bubble:nth-child(5) { left: 40%; width: 22px; height: 22px; animation-duration: 14s; animation-delay: -11s; }
        .footer-bubble:nth-child(6) { left: 49%; width: 16px; height: 16px; animation-duration: 11s; animation-delay: -7s; }
        .footer-bubble:nth-child(7) { left: 58%; width: 30px; height: 30px; animation-duration: 15s; animation-delay: -3s; }
        .footer-bubble:nth-child(8) { left: 66%; width: 12px; height: 12px; animation-duration: 10s; animation-delay: -8s; }
        .footer-bubble:nth-child(9) { left: 74%; width: 24px; height: 24px; animation-duration: 13s; animation-delay: -5s; }
        .footer-bubble:nth-child(10) { left: 82%; width: 18px; height: 18px; animation-duration: 12s; animation-delay: -10s; }
        .footer-bubble:nth-child(11) { left: 90%; width: 32px; height: 32px; animation-duration: 17s; animation-delay: -6s; }
        .footer-bubble:nth-child(12) { left: 96%; width: 14px; height: 14px; animation-duration: 11s; animation-delay: -1s; }

        @keyframes bubbleRise {
          0% {
            transform: translateY(0) translateX(0) scale(0.85);
            opacity: 0;
          }
          12% {
            opacity: 0.55;
          }
          50% {
            transform: translateY(calc(-50% - 260px)) translateX(14px) scale(1);
          }
          85% {
            opacity: 0.4;
          }
          100% {
            transform: translateY(calc(-100% - 560px)) translateX(-10px) scale(1.08);
            opacity: 0;
          }
        }

        .footer-section .container {
          position: relative;
          z-index: 1;
        }

        .footer-text {
          color: #6b7280;
          max-width: 320px;
        }

        .footer-title {
          font-weight: 800;
          margin-bottom: 14px;
          color: #0f172a;
        }

        .footer-links {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .footer-links li {
          padding: 5px 0;
          color: #6b7280;
          font-size: 0.92rem;
        }

        .footer-links a {
          color: #6b7280;
          text-decoration: none;
          transition: color 0.2s ease;
        }

        .footer-links a:hover {
          color: #007026;
        }

        .social-icon {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 1.5px dashed #cbd5e1;
          color: #334155;
          text-decoration: none;
          transition: all 0.25s ease;
        }

        .social-icon:hover {
          color: #007026;
          border-color: #9fd8b4;
          transform: translateY(-2px);
        }

        .footer-bottom {
          border-top: 1.5px dashed #cfe4d6;
          margin-top: 26px;
          padding-top: 22px;
        }

        .footer-bottom p {
          color: #6b7280;
          font-size: 0.88rem;
        }

        @media (max-width: 767px) {
          .pp-hero {
            padding: 120px 0 50px;
          }

          .pp-card {
            padding: 26px 20px;
          }

          .pp-section-head {
            gap: 11px;
          }

          .pp-num {
            width: 38px;
            height: 38px;
            border-radius: 11px;
            font-size: 0.78rem;
          }

          .pp-section-title {
            font-size: 1.02rem;
          }
        }
      `}</style>
    </div>
  );
};

export default PrivacyPolicy;
