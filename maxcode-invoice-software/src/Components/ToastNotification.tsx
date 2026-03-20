import React, { useEffect } from "react";
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

const ToastNotification = ({ type, message, duration = 3000 }) => {
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

  const styles = getToastStyles();

  return (
    <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
      <div
        className="toast show"
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
            onClick={() => {
              // Close action is handled by the shared toast lifecycle.
            }}
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
    <ToastNotification type={type} message={message} duration={duration} />,
  );

  activeToastTimer = setTimeout(() => {
    cleanupActiveToast();
  }, duration);
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
