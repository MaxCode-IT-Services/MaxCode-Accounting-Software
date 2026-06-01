import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiGet, apiPatch } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import ConfirmationModal from "./ConfirmationModal";

// Audio files - you can replace these with your own sound files
const newNotificationSound = "/Sound/Text.mp3";
const newReadSound = "/Sound/Read.wav";
const oldReadSound = "/Sound/Old.wav";
const deleteNotificationSound = "/Sound/Delete.wav";
const NOTIFICATION_POLL_INTERVAL_MS = 30000;
const MIN_FETCH_GAP_MS = 10000;

const ALERT_DAYS = [15, 10, 7, 3, 2, 1];
const LEGACY_PAYMENT_LINK_URL = "/payment-link-management";

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const parsed = parseFloat(String(value).replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatDateForDisplay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const formatDateTimeForDisplay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${day}-${month}-${year} | ${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
};

const formatCurrency = (value) => `₹${toNumber(value).toFixed(2)}`;

const getRelativeTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes > 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

const Notification = ({ onUnreadCountChange }) => {
  const [allNotifications, setAllNotifications] = useState([]);

  const [showAll, setShowAll] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [swipedId, setSwipedId] = useState(null);
  const [touchStartX, setTouchStartX] = useState(null);
  const [currentSwipeX, setCurrentSwipeX] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState(null);
  const [isSwiping, setIsSwiping] = useState(false);

  // Audio refs
  const newSoundRef = useRef(null);
  const newReadSoundRef = useRef(null);
  const oldReadSoundRef = useRef(null);
  const deleteSoundRef = useRef(null);
  const notificationsInitializedRef = useRef(false);
  const prevUnreadCountRef = useRef(0);
  const lastFetchAtRef = useRef(0);
  const isFetchingRef = useRef(false);

  const normalizeFetchedNotifications = (fetchedNotifications = []) => {
    return fetchedNotifications
      .map((item) => {
        const itemId = item?.id;
        if (!itemId) return null;

        const createdAt = item?.createdAt || new Date().toISOString();
        const daysRemaining = Number(item?.templateData?.daysRemaining ?? 0);

        if (
          (item?.templateType === "service-expiry" ||
            item?.templateType === "service-history-expiry") &&
          !ALERT_DAYS.includes(daysRemaining)
        ) {
          return null;
        }

        return {
          ...item,
          id: itemId,
          type: item?.type || (daysRemaining <= 3 ? "danger" : "warning"),
          icon: item?.icon || "bullhorn",
          image: item?.image || "https://img.maxcodehub.com/Others/Ex.png",
          links: Array.isArray(item?.links) ? item.links : [],
          read: Boolean(item?.read),
          expanded: false,
          createdAt,
          daysRemaining,
          time: getRelativeTime(createdAt),
          date: formatDateTimeForDisplay(createdAt),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  };

  const fetchNotifications = async (options = {}) => {
    const { force = false } = options;

    const now = Date.now();
    if (!force) {
      if (isFetchingRef.current) return;
      if (document.visibilityState !== "visible") return;
      if (now - lastFetchAtRef.current < MIN_FETCH_GAP_MS) return;
    }

    isFetchingRef.current = true;
    try {
      const response = await apiGet(API_ENDPOINTS.NOTIFICATION.LIST);
      const fetchedNotifications = Array.isArray(response?.data?.notifications)
        ? response.data.notifications
        : [];
      setAllNotifications(normalizeFetchedNotifications(fetchedNotifications));
      lastFetchAtRef.current = Date.now();
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchNotifications({ force: true });

    const pollId = setInterval(() => {
      fetchNotifications();
    }, NOTIFICATION_POLL_INTERVAL_MS);

    const handleWindowFocus = () => {
      fetchNotifications();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchNotifications();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(pollId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Calculate unread count whenever notifications change
  useEffect(() => {
    const currentUnreadCount = allNotifications.filter((n) => !n.read).length;
    const previousUnreadCount = prevUnreadCountRef.current;
    onUnreadCountChange(currentUnreadCount);

    if (
      notificationsInitializedRef.current &&
      currentUnreadCount > previousUnreadCount
    ) {
      // New notification arrived
      if (newSoundRef.current) {
        newSoundRef.current.currentTime = 0;
        newSoundRef.current
          .play()
          .catch((e) => console.log("Audio play failed:", e));
      }
    }

    notificationsInitializedRef.current = true;
    prevUnreadCountRef.current = currentUnreadCount;
  }, [allNotifications, onUnreadCountChange]);

  // Get notifications to display (either first 4 or all)
  const notifications = showAll
    ? allNotifications
    : allNotifications.slice(0, 3);

  const toggleExpand = (id) => {
    if (isSwiping) return;

    const selectedNotification = allNotifications.find(
      (notification) => notification.id === id,
    );

    setAllNotifications(
      allNotifications.map((notification) => {
        if (notification.id === id) {
          // Play different sound based on whether it's a new or old notification
          if (!notification.read) {
            // New notification being read
            if (newReadSoundRef.current) {
              newReadSoundRef.current.currentTime = 0;
              newReadSoundRef.current
                .play()
                .catch((e) => console.log("Audio play failed:", e));
            }
          } else {
            // Old notification being read
            if (oldReadSoundRef.current) {
              oldReadSoundRef.current.currentTime = 0;
              oldReadSoundRef.current
                .play()
                .catch((e) => console.log("Audio play failed:", e));
            }
          }

          return {
            ...notification,
            expanded: !notification.expanded,
            read: true,
          };
        } else {
          return { ...notification, expanded: false };
        }
      }),
    );

    if (selectedNotification && !selectedNotification.read) {
      apiPatch(API_ENDPOINTS.NOTIFICATION.MARK, { id, read: true }).catch(
        (error) => {
          console.error("Failed to mark notification read:", error);
        },
      );
    }
  };

  const markAsRead = (id, e) => {
    e?.stopPropagation();
    setAllNotifications(
      allNotifications.map((notification) => {
        if (notification.id === id) {
          // Play different sound based on whether it's a new or old notification
          if (!notification.read) {
            // New notification being marked as read
            if (newReadSoundRef.current) {
              newReadSoundRef.current.currentTime = 0;
              newReadSoundRef.current
                .play()
                .catch((e) => console.log("Audio play failed:", e));
            }
          } else {
            // Old notification being marked as read (though this case shouldn't normally happen)
            if (oldReadSoundRef.current) {
              oldReadSoundRef.current.currentTime = 0;
              oldReadSoundRef.current
                .play()
                .catch((e) => console.log("Audio play failed:", e));
            }
          }
          return { ...notification, read: true };
        }
        return notification;
      }),
    );

    apiPatch(API_ENDPOINTS.NOTIFICATION.MARK, { id, read: true }).catch(
      (error) => {
        console.error("Failed to mark notification read:", error);
      },
    );
  };

  const markAllAsRead = () => {
    // Play new read sound if there are any unread notifications
    if (allNotifications.some((n) => !n.read) && newReadSoundRef.current) {
      newReadSoundRef.current.currentTime = 0;
      newReadSoundRef.current
        .play()
        .catch((e) => console.log("Audio play failed:", e));
    }

    setAllNotifications(
      allNotifications.map((notification) => ({
        ...notification,
        read: true,
      })),
    );

    apiPatch(API_ENDPOINTS.NOTIFICATION.MARK, {
      action: "markAllRead",
    }).catch((error) => {
      console.error("Failed to mark all notifications read:", error);
    });
  };

  const handleDeleteClick = (id, e) => {
    e?.stopPropagation();
    setNotificationToDelete(id);
    setShowDeleteModal(true);
    setSwipedId(null);
  };

  const confirmDelete = () => {
    // Play delete sound before deleting
    if (deleteSoundRef.current) {
      deleteSoundRef.current.currentTime = 0;
      deleteSoundRef.current
        .play()
        .catch((e) => console.log("Audio play failed:", e));
    }

    setAllNotifications(
      allNotifications.filter(
        (notification) => notification.id !== notificationToDelete,
      ),
    );

    apiDelete(API_ENDPOINTS.NOTIFICATION.DELETE(notificationToDelete)).catch(
      (error) => {
        console.error("Failed to delete notification:", error);
      },
    );

    setShowDeleteModal(false);
    setNotificationToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setNotificationToDelete(null);
  };

  const openImagePopup = (imageUrl, e) => {
    e.stopPropagation();
    setSelectedImage(imageUrl);
  };

  const closeImagePopup = () => {
    setSelectedImage(null);
  };

  const handleTouchStart = (e, id) => {
    setTouchStartX(e.targetTouches[0].clientX);
    setCurrentSwipeX(e.targetTouches[0].clientX);
    setSwipedId(id);
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (touchStartX === null) return;
    setCurrentSwipeX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (id) => {
    if (touchStartX === null || currentSwipeX === null) return;

    const distance = touchStartX - currentSwipeX;
    const isLeftSwipe = distance > 50;

    if (isLeftSwipe) {
      setSwipedId(id);
    } else {
      setSwipedId(null);
    }

    setTouchStartX(null);
    setCurrentSwipeX(null);
    setIsSwiping(false);
  };

  const handleMouseDown = (e, id) => {
    setTouchStartX(e.clientX);
    setCurrentSwipeX(e.clientX);
    setSwipedId(id);
    setIsSwiping(true);
  };

  const handleMouseMove = (e) => {
    if (!isSwiping || touchStartX === null) return;
    setCurrentSwipeX(e.clientX);
  };

  const handleMouseUp = (id) => {
    if (!isSwiping || touchStartX === null || currentSwipeX === null) {
      setIsSwiping(false);
      return;
    }

    const distance = touchStartX - currentSwipeX;
    const isLeftSwipe = distance > 50;

    if (isLeftSwipe) {
      setSwipedId(id);
    } else {
      setSwipedId(null);
    }

    setTouchStartX(null);
    setCurrentSwipeX(null);
    setIsSwiping(false);
  };

  const getTransformStyle = (id) => {
    if (touchStartX === null || currentSwipeX === null || swipedId !== id) {
      return swipedId === id ? "translateX(-50px)" : "translateX(0)";
    }

    const distance = touchStartX - currentSwipeX;
    if (distance <= 0) return "translateX(0)";
    if (distance > 50) return "translateX(-50px)";
    return `translateX(-${distance}px)`;
  };

  const getTypeColor = (type) => {
    switch (type) {
      case "success":
        return "text-success";
      case "danger":
        return "text-danger";
      case "warning":
        return "text-warning";
      case "info":
        return "text-info";
      case "primary":
        return "text-primary";
      default:
        return "text-primary";
    }
  };

  const getNotificationIcon = (icon) => {
    switch (icon) {
      case "check-circle":
        return "fa-check-circle";
      case "x-circle":
        return "fa-times-circle";
      case "chat-left-text":
        return "fa-comment-alt";
      case "tag":
        return "fa-tag";
      case "person-check":
        return "fa-user-check";
      case "bullhorn":
        return "fa-bullhorn";
      default:
        return "fa-bell";
    }
  };

  const truncateText = (text, maxLines = 2, maxLength = 100) => {
    if (text.length <= maxLength) return text;

    // First truncate by length
    const truncated = text.substring(0, maxLength) + "...";

    // Then ensure it fits in maxLines
    const lines = truncated.split("\n");
    if (lines.length <= maxLines) return truncated;

    return lines.slice(0, maxLines).join("\n") + "...";
  };

  const renderNotificationDescription = (notification) => {
    if (notification?.templateType === "payment-verification") {
      const details = notification.templateData || {};

      return (
        <>
          <strong>Client Name:</strong> {details.clientName || "-"}
          <br />
          <strong>Business Name:</strong> {details.businessName || "-"}
          <br />
          <strong>Amount:</strong> {details.amount || "-"}
          <br />
          <strong>Payment Date:</strong> {details.paymentDate || "-"}
          <br />
          <strong>Status:</strong> {details.status || "-"}
          <br />
          <strong>Transaction ID / UTR:</strong> {details.utrNumber || "-"}
        </>
      );
    }

    if (
      notification?.templateType !== "service-expiry" &&
      notification?.templateType !== "service-history-expiry"
    ) {
      return notification.expanded
        ? notification.description
        : truncateText(notification.description || "");
    }

    const details = notification.templateData || {};
    const dayLabel =
      Number(details.daysRemaining) > 1
        ? `${details.daysRemaining} days`
        : `${details.daysRemaining} day`;

    return (
      <>
        <strong>{details.serviceName || "Service"}</strong> Subsciption for{" "}
        <strong>{details.businessName || "Business"}</strong> is Expirying in{" "}
        <strong>{dayLabel}</strong>. Expiry Date:{" "}
        <strong>{details.expiryDate}</strong>, Price:{" "}
        <strong>{details.price}</strong>, Tax{" "}
        <strong>{details.taxPercentage}%</strong>:{" "}
        <strong>{details.taxAmount}</strong>, Total Amount{" "}
        <strong>{details.totalAmount}</strong>.
        <br />
        Please take necessary action to renew or notify the client.
      </>
    );
  };

  const isAbsoluteHttpUrl = (value = "") => /^https?:\/\//i.test(value);

  const resolvePaymentVerificationLink = async (notification, fallbackUrl) => {
    const details = notification?.templateData || {};
    const directUrl = String(details.shareUrl || "").trim();
    if (isAbsoluteHttpUrl(directUrl)) {
      return directUrl;
    }

    const alias = String(details.alias || "").trim();
    if (alias) {
      try {
        const response = await apiGet(
          API_ENDPOINTS.PAYMENT_LINKS.PUBLIC_BY_ALIAS(alias),
          { forceRefresh: true, cache: false },
        );
        const resolvedUrl = String(
          response?.data?.record?.shareUrl || "",
        ).trim();
        if (isAbsoluteHttpUrl(resolvedUrl)) {
          return resolvedUrl;
        }
      } catch (error) {
        console.error(
          "Failed to resolve public payment link from notification:",
          error,
        );
      }
    }

    const domain = String(details.domain || "")
      .trim()
      .replace(/\/+$/, "");
    if (domain && alias) {
      return `${domain}/${alias}`;
    }

    return fallbackUrl;
  };

  const handleLinkClick = async (e, notification, link) => {
    e.stopPropagation();
    const rawUrl = String(link?.url || "").trim();
    const isPaymentVerification =
      notification?.templateType === "payment-verification";

    if (!isPaymentVerification) {
      return;
    }

    e.preventDefault();

    const resolvedUrl = await resolvePaymentVerificationLink(
      notification,
      rawUrl,
    );

    if (isAbsoluteHttpUrl(resolvedUrl)) {
      window.open(resolvedUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (resolvedUrl && resolvedUrl !== LEGACY_PAYMENT_LINK_URL) {
      window.location.assign(resolvedUrl);
      return;
    }

    window.location.assign(rawUrl || LEGACY_PAYMENT_LINK_URL);
  };

  return (
    <>
      {/* Audio elements */}
      <audio ref={newSoundRef} src={newNotificationSound} preload="auto" />
      <audio ref={newReadSoundRef} src={newReadSound} preload="auto" />
      <audio ref={oldReadSoundRef} src={oldReadSound} preload="auto" />
      <audio
        ref={deleteSoundRef}
        src={deleteNotificationSound}
        preload="auto"
      />

      {/* Notification Panel */}
      <div
        className="offcanvas offcanvas-end"
        tabIndex="-1"
        id="notificationSlider"
        aria-labelledby="notificationSliderLabel"
        style={{ width: "420px" }}
      >
        {/* Header */}
        <div className="offcanvas-header border-bottom px-3 py-2">
          <div className="d-flex justify-content-between w-100 align-items-center">
            <div className="d-flex align-items-center">
              <i className="fas fa-bell me-2 fs-5 text-primary"></i>
              <h5
                className="offcanvas-title fw-bold mb-0"
                id="notificationSliderLabel"
              >
                Notifications
                {/* {allNotifications.filter(n => !n.read).length > 0 && (
                  <span className="ms-2 badge bg-primary rounded-pill">
                    {allNotifications.filter(n => !n.read).length} New
                  </span>
                )} */}
              </h5>
            </div>
            <div>
              {allNotifications.length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="btn btn-sm btn-outline-success me-2"
                  disabled={
                    allNotifications.filter((n) => !n.read).length === 0
                  }
                >
                  <i className="fas fa-check-double me-1"></i> Mark all read
                </button>
              )}
              <button
                className="btn-close"
                data-bs-dismiss="offcanvas"
                aria-label="Close"
              ></button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="offcanvas-body p-0">
          {allNotifications.length === 0 ? (
            <div className="text-center py-5">
              <i className="fas fa-bell-slash fs-1 text-muted mb-3"></i>
              <h5 className="text-muted">No notifications</h5>
              <p className="text-muted small">You're all caught up!</p>
            </div>
          ) : (
            <div
              className="list-group list-group-flush"
              onMouseMove={handleMouseMove}
              onMouseUp={() => setIsSwiping(false)}
              onMouseLeave={() => setIsSwiping(false)}
            >
              {notifications.map((notification, index) => (
                <React.Fragment key={notification.id}>
                  <div
                    className={`position-relative ${swipedId === notification.id ? "swiped" : ""}`}
                  >
                    {/* Notification Item */}
                    <div
                      className={`list-group-item list-group-item-action p-0 mb-0
                        ${!notification.read ? "bg-light" : ""}
                        ${notification.expanded ? "bg-light" : ""}`}
                      onClick={() => toggleExpand(notification.id)}
                      onTouchStart={(e) => handleTouchStart(e, notification.id)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={() => handleTouchEnd(notification.id)}
                      onMouseDown={(e) => handleMouseDown(e, notification.id)}
                      onMouseUp={() => handleMouseUp(notification.id)}
                      style={{
                        cursor: "pointer",
                        transition: isSwiping ? "none" : "transform 0.2s ease",
                        transform: getTransformStyle(notification.id),
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      <div className="px-3 py-2">
                        {/* Notification Header */}
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div className="d-flex align-items-center">
                            <i
                              className={`fas ${getNotificationIcon(notification.icon)} me-2 fs-5 ${getTypeColor(notification.type)}`}
                            ></i>
                            <h6
                              className={`mb-0 ${!notification.read ? "fw-bold" : "fw-semibold"}`}
                            >
                              {notification.title}
                            </h6>
                          </div>
                          <div className="d-flex align-items-center">
                            {!notification.read && (
                              <span
                                className="badge bg-success rounded-pill me-2 py-1 px-2"
                                style={{ fontSize: "0.7rem" }}
                              >
                                New
                              </span>
                            )}
                            <small className="text-muted">
                              {notification.time}
                            </small>
                          </div>
                        </div>

                        {/* Notification Content */}
                        <div className="d-flex gap-3">
                          {/* Thumbnail Image with click handler */}
                          <div className="flex-shrink-0">
                            <div
                              className="position-relative"
                              onClick={(e) =>
                                openImagePopup(notification.image, e)
                              }
                              style={{ cursor: "zoom-in" }}
                            >
                              <img
                                src={notification.image}
                                className="rounded-2"
                                width="60"
                                height="60"
                                alt="Notification"
                                style={{
                                  objectFit: "cover",
                                  transition: "transform 0.2s",
                                }}
                                onMouseOver={(e) =>
                                  (e.currentTarget.style.transform =
                                    "scale(1.05)")
                                }
                                onMouseOut={(e) =>
                                  (e.currentTarget.style.transform = "scale(1)")
                                }
                              />
                              <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-dark bg-opacity-25 rounded-2 opacity-0 hover-opacity-100 transition-all">
                                <i className="fas fa-search-plus text-white fs-5"></i>
                              </div>
                            </div>
                          </div>

                          {/* Text Content */}
                          <div className="flex-grow-1">
                            <p
                              className="mb-2 text-muted"
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: notification.expanded
                                  ? "unset"
                                  : 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                textOverflow: notification.expanded
                                  ? "clip"
                                  : "ellipsis",
                                lineHeight: "1.4",
                                maxHeight: notification.expanded
                                  ? "none"
                                  : "2.8em",
                              }}
                            >
                              {renderNotificationDescription(notification)}
                            </p>

                            {/* Additional Date & Time Below Description */}
                            <small className="text-muted d-block mb-2">
                              <i className="fas fa-clock me-1"></i>{" "}
                              {notification.date}
                            </small>

                            {/* Notification Links - Only visible when expanded */}
                            {notification.expanded &&
                              notification.links.length > 0 && (
                                <div
                                  className={`d-flex gap-2 ${notification.links.length === 1 ? "flex-column" : ""}`}
                                >
                                  {notification.links.map((link, idx) => (
                                    <Link
                                      key={idx}
                                      to={link.url}
                                      onClick={(e) =>
                                        handleLinkClick(e, notification, link)
                                      }
                                      className={`btn btn-sm btn-outline-primary ${notification.links.length === 1 ? "w-100" : "flex-grow-1"}`}
                                    >
                                      {link.text}
                                    </Link>
                                  ))}
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Delete Button (hidden until swiped) */}
                    <div
                      className="position-absolute top-0 end-0 h-100 d-flex align-items-center pe-3"
                      style={{
                        width: "50px",
                        zIndex: 0,
                        right: "-50px",
                      }}
                    >
                      <button
                        className="btn btn-primary rounded-0 h-100 d-flex align-items-center justify-content-center"
                        onClick={(e) => handleDeleteClick(notification.id, e)}
                        style={{
                          opacity: swipedId === notification.id ? 1 : 0,
                          transition: "opacity 0.2s",
                          width: "50px",
                          borderLeft: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: "0",
                        }}
                      >
                        <i
                          className="fas fa-trash fs-5"
                          style={{ marginRight: "0px" }}
                        ></i>
                      </button>
                    </div>
                  </div>

                  {/* Divider between notifications */}
                  {index < notifications.length - 1 && <hr className="m-0" />}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {allNotifications.length > 0 && (
          <div className="offcanvas-footer border-top px-3 py-2">
            {!showAll && allNotifications.length > 4 ? (
              <button
                className="btn btn-lg btn-primary w-100 rounded-pill"
                onClick={() => setShowAll(true)}
              >
                <i className="fas fa-arrow-circle-down me-2"></i> View all
                notifications
              </button>
            ) : showAll ? (
              <button
                className="btn btn-lg btn-primary w-100 rounded-pill"
                disabled={true}
              >
                <i className="fas fa-check-circle me-2"></i> All notifications
                loaded
              </button>
            ) : (
              <Link
                to="/notifications"
                className="btn btn-lg btn-primary w-100 rounded-pill"
              >
                <i className="fas fa-list-ul me-2"></i> View notifications page
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Image Popup Modal */}
      {selectedImage && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 bg-transparent">
              <div className="modal-header border-0">
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeImagePopup}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body text-center">
                <img
                  src={selectedImage}
                  className="img-fluid rounded-3 shadow-lg"
                  style={{ maxHeight: "80vh" }}
                  alt="Notification Preview"
                />
              </div>
              <div className="modal-footer border-0 justify-content-center">
                <button
                  className="btn btn-outline-light rounded-pill"
                  onClick={closeImagePopup}
                >
                  <i className="fas fa-times me-1"></i> Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        show={showDeleteModal}
        onHide={cancelDelete}
        onConfirm={confirmDelete}
        title="Delete Notification"
        message="Are you sure you want to delete this notification? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        confirmationText="delete"
      />

      {/* Custom CSS */}
      <style>{`
        .list-group-item {
          transition:
            transform 0.3s ease,
            background-color 0.2s ease;
        }
        .swiped {
          overflow: hidden;
        }
        hr {
          transition: all 0.3s ease;
        }
      `}</style>
    </>
  );
};

export default Notification;
