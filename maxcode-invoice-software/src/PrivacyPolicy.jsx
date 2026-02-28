import React from "react";

const sectionStyle = {
  marginTop: 32,
  marginBottom: 0,
  color: "#0d6efd",
  fontWeight: 700,
  fontSize: 20,
  letterSpacing: 0.2,
};

const PrivacyPolicy = () => (
  <div
    style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #e0e7ff 0%, #f8fafc 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "56px 0 48px 0",
    }}
  >
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        boxShadow: "0 8px 40px rgba(16,30,54,0.13)",
        maxWidth: 760,
        width: "100%",
        padding: "48px 40px 40px 40px",
        margin: "0 16px",
        position: "relative",
        border: "1.5px solid #e0e7ff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #0d6efd 60%, #6366f1 100%)",
            borderRadius: "50%",
            width: 60,
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 12px #0d6efd33",
          }}
        >
          <svg width="34" height="34" fill="#fff" viewBox="0 0 24 24">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 5.523 4.477 10 10 10s10-4.477 10-10c0-5.523-4.477-10-10-10zm0 18c-4.418 0-8-3.582-8-8 0-4.418 3.582-8 8-8s8 3.582 8 8c0 4.418-3.582 8-8 8zm-1-13h2v2h-2zm0 4h2v8h-2z" />
          </svg>
        </div>
        <div>
          <h1
            style={{
              fontWeight: 900,
              margin: 0,
              color: "#1a202c",
              fontSize: 30,
              letterSpacing: 0.5,
            }}
          >
            Privacy Policy
          </h1>
          <div style={{ color: "#64748b", fontSize: 15, marginTop: 2 }}>
            <strong>Effective Date:</strong> February 28, 2026
          </div>
        </div>
      </div>
      <p
        style={{
          color: "#334155",
          fontSize: 17,
          marginBottom: 22,
          lineHeight: 1.7,
        }}
      >
        This Privacy Policy explains how MaxCode Accounting Software ("we",
        "us", or "our") collects, uses, and protects your information when you
        use our software.
      </p>
      <div
        style={{ borderTop: "1.5px solid #e5e7eb", margin: "28px 0 22px 0" }}
      />
      <h4 style={sectionStyle}>1. Information We Collect</h4>
      <ul
        style={{
          marginBottom: 20,
          color: "#334155",
          paddingLeft: 22,
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        <li>
          Personal information you provide (such as name, email, company
          details).
        </li>
        <li>Usage data and analytics to improve our services.</li>
        <li>Data entered for accounting and business management purposes.</li>
      </ul>
      <h4 style={sectionStyle}>2. How We Use Your Information</h4>
      <ul
        style={{
          marginBottom: 20,
          color: "#334155",
          paddingLeft: 22,
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        <li>To provide and maintain the software features.</li>
        <li>To communicate updates, support, and important notices.</li>
        <li>To improve user experience and software performance.</li>
      </ul>
      <h4 style={sectionStyle}>3. Data Security</h4>
      <p style={{ color: "#334155", fontSize: 15, lineHeight: 1.7 }}>
        We implement industry-standard security measures to protect your data.
        However, no method of transmission or storage is 100% secure.
      </p>
      <h4 style={sectionStyle}>4. Data Sharing</h4>
      <p style={{ color: "#334155", fontSize: 15, lineHeight: 1.7 }}>
        We do not sell or share your personal information with third parties
        except as required by law or with your explicit consent.
      </p>
      <h4 style={sectionStyle}>5. Your Rights</h4>
      <ul
        style={{
          marginBottom: 20,
          color: "#334155",
          paddingLeft: 22,
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        <li>
          You can request access, correction, or deletion of your personal data.
        </li>
        <li>Contact us for any privacy-related concerns.</li>
      </ul>
      <h4 style={sectionStyle}>6. Changes to This Policy</h4>
      <p style={{ color: "#334155", fontSize: 15, lineHeight: 1.7 }}>
        We may update this Privacy Policy from time to time. Changes will be
        posted on this page with the updated effective date.
      </p>
      <h4 style={sectionStyle}>7. Contact Us</h4>
      <p style={{ color: "#334155", fontSize: 15, lineHeight: 1.7 }}>
        For questions or concerns about this Privacy Policy, please contact{" "}
        <a
          href="mailto:support@maxcodeit.com"
          style={{ color: "#0d6efd", textDecoration: "underline" }}
        >
          contact@maxcode.in
        </a>
        .
      </p>
    </div>
  </div>
);

export default PrivacyPolicy;
