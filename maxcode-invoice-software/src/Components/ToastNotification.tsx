import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";

// Import sound files - adjust paths according to your project structure
// Note: You'll need to configure your bundler (webpack/vite) to handle audio files
import successSound from "/Sound/Read.wav";
import errorSound from "/Sound/Read.wav";
import warningSound from "/Sound/Read.wav";
import infoSound from "/Sound/Read.wav";

let hasUserInteracted = false;

const markUserInteraction = () => {
  hasUserInteracted = true;
};

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", markUserInteraction, { once: true });
  window.addEventListener("keydown", markUserInteraction, { once: true });
}

const ToastNotification = ({ type, message, duration = 3000, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);
  const toastRef = useRef(null);
  const isClosingRef = useRef(false);

  // Get settings with default values
  const settings = JSON.parse(
    localStorage.getItem("adminSettings") || '{"soundNotifications": true}',
  );

  useEffect(() => {
    // Play sound if sound notifications are enabled
    if (settings.soundNotifications) {
      const soundFile = getSoundFile(type);
      playNotificationSound(soundFile);
    }
  }, [type, settings.soundNotifications]);

  // Auto-dismiss timer — triggers exit animation instead of immediate cleanup
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isClosingRef.current) {
        setIsExiting(true);
      }
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  // Listen for exit animation end to safely remove DOM
  useEffect(() => {
    const el = toastRef.current;
    if (!el) return;

    const handleAnimationEnd = (e) => {
      if (e.animationName === "toastSlideOut" && onClose && !isClosingRef.current) {
        isClosingRef.current = true;
        onClose();
      }
    };

    el.addEventListener("animationend", handleAnimationEnd);
    return () => el.removeEventListener("animationend", handleAnimationEnd);
  }, [onClose]);

  const getSoundFile = (type) => {
    switch (type) {
      case "success":
        return successSound;
      case "error":
        return errorSound;
      case "warning":
        return warningSound;
      case "info":
        return infoSound;
      default:
        return successSound;
    }
  };

  const playNotificationSound = (soundFile) => {
    try {
      if (!hasUserInteracted) {
        return;
      }

      const audio = new Audio(soundFile);
      audio.muted = false;
      audio.volume = 0.5; // 50% volume

      const playPromise = audio.play();

      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Ignore browser autoplay rejection.
        });
      }
    } catch (error) {
      console.error("Error playing sound:", error);
    }
  };

  const getToastStyles = () => {
    switch (type) {
      case "success":
        return {
          headerClass: "bg-success text-white",
          title: "Success",
        };
      case "error":
        return {
          headerClass: "bg-danger text-white",
          title: "Error",
        };
      case "warning":
        return {
          headerClass: "bg-warning text-dark",
          title: "Warning",
        };
      case "info":
        return {
          headerClass: "bg-info text-white",
          title: "Info",
        };
      default:
        return {
          headerClass: "bg-primary text-white",
          title: "Notification",
        };
    }
  };

  const handleClose = () => {
    setIsExiting(true);
  };

  const styles = getToastStyles();
  const animationClass = isExiting ? "toast-exit" : "toast-enter";

  return (
    <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
      <div
        ref={toastRef}
        className={`toast show ${animationClass}`}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div className={`toast-header ${styles.headerClass}`}>
          <strong className="me-auto">{styles.title}</strong>
          <button
            type="button"
            className="btn-close btn-close-white"
            data-bs-dismiss="toast"
            aria-label="Close"
            onClick={handleClose}
          ></button>
        </div>
        <div className="toast-body bg-white">{message}</div>
      </div>
    </div>
  );
};

// Toast manager functions
let activeToastRoot = null;
let activeToastContainer = null;
let activeToastTimer = null;

const cleanupActiveToast = () => {
  if (activeToastTimer) {
    clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }

  if (activeToastRoot) {
    try {
      activeToastRoot.unmount();
    } catch {
      // Ignore unmount race conditions.
    }
    activeToastRoot = null;
  }

  if (activeToastContainer && activeToastContainer.parentNode) {
    activeToastContainer.parentNode.removeChild(activeToastContainer);
  }
  activeToastContainer = null;
};

const showToast = (type, message, duration = 3000) => {
  cleanupActiveToast();

  activeToastContainer = document.createElement("div");
  document.body.appendChild(activeToastContainer);

  activeToastRoot = createRoot(activeToastContainer);
  activeToastRoot.render(
    <ToastNotification type={type} message={message} duration={duration} onClose={cleanupActiveToast} />,
  );
};

// Convenience functions for different toast types
export const showSuccess = (message, duration = 3000) =>
  showToast("success", message, duration);
export const showError = (message, duration = 5000) =>
  showToast("error", message, duration);
export const showWarning = (message, duration = 4000) =>
  showToast("warning", message, duration);
export const showInfo = (message, duration = 3000) =>
  showToast("info", message, duration);

// Default export for the ToastNotification component
export default ToastNotification;
