import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

const ALERT_DAYS = [15, 10, 7, 3, 2, 1, 0];
const LEAD_FOLLOWUP_ALERT_DAYS = [1, 0];
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_RESPONSE_CACHE_TTL_MS = 15000;

let notificationResponseCache = new Map();

const toNumber = (value) => {
  const parsed = parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDateString = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatDateForDisplay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatCurrency = (value) => `₹${toNumber(value).toFixed(2)}`;

const findApplicableFinancialYear = (expiryDate, financialYears = []) => {
  const targetDate = getDateOnly(expiryDate);
  if (!targetDate) return null;

  return financialYears.find((year) => {
    if (year?.isDeleted === true) return false;
    const startDate = getDateOnly(year?.startDate);
    const endDate = getDateOnly(year?.endDate);
    if (!startDate || !endDate) return false;
    return targetDate >= startDate && targetDate <= endDate;
  });
};

const buildServiceHistoryExpiryNotifications = ({
  serviceRecords = [],
  financialYears = [],
  today,
}) => {
  const notifications = [];

  serviceRecords.forEach((record) => {
    const serviceRows = Array.isArray(record?.transactions)
      ? record.transactions
      : [];

    serviceRows.forEach((service, index) => {
      if (!service?.expiryDate) return;

      const rowStatus = String(service?.status || "Active")
        .trim()
        .toLowerCase();
      if (rowStatus !== "active") return;

      const expiryDate = getDateOnly(service.expiryDate);
      if (!expiryDate) return;

      const daysRemaining = Math.floor(
        (expiryDate.getTime() - today.getTime()) / DAY_IN_MS,
      );

      if (!ALERT_DAYS.includes(daysRemaining)) return;

      const applicableYear = findApplicableFinancialYear(
        service.expiryDate,
        financialYears,
      );

      const taxPercentage = toNumber(applicableYear?.taxPercentage || 0);
      const price = toNumber(service?.price);
      const taxAmount = (price * taxPercentage) / 100;
      const totalAmount = price + taxAmount;

      const recordIdentifier =
        record?._id || record?.id || record?.serviceNumber || "service";
      const rowIdentifier = service?.id || index + 1;
      const dedupeKey = `service-history-expiry-${recordIdentifier}-${rowIdentifier}-${service.expiryDate}-${daysRemaining}`;

      notifications.push({
        dedupeKey,
        title: "📢 Renewal Reminder",
        description: `${service.serviceName || "Service"} renewal for ${record.businessName || "Business"} is expiring in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""}. Expiry Date: ${formatDateForDisplay(service.expiryDate)}, Price: ${formatCurrency(price)}, Tax ${taxPercentage}%: ${formatCurrency(taxAmount)}, Total Amount ${formatCurrency(totalAmount)}. Please take necessary action to renew or notify the client.`,
        icon: "bullhorn",
        type: daysRemaining <= 3 ? "danger" : "warning",
        image: "https://img.maxcodehub.com/Others/Ex.png",
        templateType: "service-history-expiry",
        templateData: {
          serviceName: service.serviceName || "Service",
          businessName: record.businessName || "Business",
          renewDate: service?.renewDate || "",
          daysRemaining,
          expiryDate: formatDateForDisplay(service.expiryDate),
          price: formatCurrency(price),
          taxPercentage,
          taxAmount: formatCurrency(taxAmount),
          totalAmount: formatCurrency(totalAmount),
        },
        links: [],
      });
    });
  });

  notifications.sort((a, b) => {
    const daysA = toNumber(a?.templateData?.daysRemaining);
    const daysB = toNumber(b?.templateData?.daysRemaining);
    if (daysA !== daysB) return daysA - daysB;

    const businessA = String(a?.templateData?.businessName || "");
    const businessB = String(b?.templateData?.businessName || "");
    return businessA.localeCompare(businessB);
  });

  return notifications;
};

const buildLeadFollowUpNotifications = ({ leadRecords = [], today }) => {
  const notifications = [];

  leadRecords.forEach((lead) => {
    if (lead?.isDeleted === true) return;
    if (String(lead?.status || "Active").toLowerCase() === "inactive") return;
    if (!lead?.followUpDate) return;

    const followUpDate = getDateOnly(lead.followUpDate);
    if (!followUpDate) return;

    const daysRemaining = Math.floor(
      (followUpDate.getTime() - today.getTime()) / DAY_IN_MS,
    );

    if (!LEAD_FOLLOWUP_ALERT_DAYS.includes(daysRemaining)) return;

    const leadIdentifier = lead?._id || lead?.id || lead?.leadName || "lead";
    const dedupeKey = `lead-followup-${leadIdentifier}-${lead.followUpDate}-${daysRemaining}`;
    const leadName = lead?.leadName || "Lead";
    const businessName = lead?.businessName || "Business";
    const whenText = daysRemaining === 0 ? "today" : "tomorrow";

    notifications.push({
      dedupeKey,
      title: "Lead Follow-up Reminder",
      description: `Follow-up for ${leadName} (${businessName}) is due ${whenText}. Follow-up Date: ${formatDateForDisplay(lead.followUpDate)}.${lead?.phoneNumber ? ` Phone: ${lead.phoneNumber}.` : ""}`,
      icon: "calendar-check",
      type: daysRemaining === 0 ? "danger" : "warning",
      image: "https://img.maxcodehub.com/Others/Ex.png",
      templateType: "lead-followup",
      templateData: {
        leadId: String(lead?._id || lead?.id || ""),
        leadName,
        businessName,
        phoneNumber: lead?.phoneNumber || "",
        whatsappNumber: lead?.whatsappNumber || "",
        followUpDate: formatDateForDisplay(lead.followUpDate),
        daysRemaining,
      },
      links: [],
    });
  });

  notifications.sort((a, b) => {
    const daysA = toNumber(a?.templateData?.daysRemaining);
    const daysB = toNumber(b?.templateData?.daysRemaining);
    if (daysA !== daysB) return daysA - daysB;

    const leadA = String(a?.templateData?.leadName || "");
    const leadB = String(b?.templateData?.leadName || "");
    return leadA.localeCompare(leadB);
  });

  return notifications;
};

const resolveCurrentUserId = (decodedToken = {}) => {
  const resolved =
    decodedToken?.userId || decodedToken?.id || decodedToken?._id || null;
  return resolved ? String(resolved) : null;
};

const normalizeReadBy = (readBy = []) => {
  if (!Array.isArray(readBy)) return [];

  return readBy
    .map((entry) => {
      const userId = entry?.userId ? String(entry.userId) : "";
      if (!userId) return null;

      return {
        userId,
        name: entry?.name || "",
        role: entry?.role || "",
        readAt: entry?.readAt || null,
      };
    })
    .filter(Boolean);
};

const hasUserReadNotification = (readBy = [], userId = "") => {
  if (!userId) return false;
  return readBy.some((entry) => String(entry?.userId || "") === userId);
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const decodedToken = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const notificationsCollection = db.collection("notifications");
    const notificationRunsCollection = db.collection("notificationRuns");
    const servicesCollection = db.collection("services");
    const leadsCollection = db.collection("leads");
    const yearsCollection = db.collection("financialYears");
    const usersCollection = db.collection("users");

    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters || {};
      const limitNum = Math.min(
        Math.max(parseInt(query.limit, 10) || 100, 1),
        300,
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dateKey = getDateString(today);
      const notificationType = "daily-reminders";
      const currentUserId = resolveCurrentUserId(decodedToken);
      const cacheKey = `${currentUserId || "anonymous"}|${limitNum}`;

      const cachedResponse = notificationResponseCache.get(cacheKey);
      if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
        return createResponse(200, cachedResponse.payload, origin);
      }

      let loggedInUser = null;
      if (currentUserId && ObjectId.isValid(currentUserId)) {
        loggedInUser = await usersCollection.findOne(
          { _id: new ObjectId(currentUserId) },
          { projection: { showNotification: 1, name: 1, role: 1 } },
        );

        if (loggedInUser?.showNotification === false) {
          return createResponse(
            200,
            {
              dateKey,
              unreadCount: 0,
              notifications: [],
            },
            origin,
          );
        }
      }

      const runRecord = await notificationRunsCollection.findOne({
        dateKey,
        notificationType,
      });

      if (!runRecord) {
        const lockTime = new Date();
        const runUpsertResult = await notificationRunsCollection.updateOne(
          { dateKey, notificationType },
          {
            $setOnInsert: {
              dateKey,
              notificationType,
              generatedCount: 0,
              generatedByUserId: currentUserId,
              generatedByRole: decodedToken?.role || "unknown",
              createdAt: lockTime,
            },
            $set: {
              updatedAt: lockTime,
            },
          },
          { upsert: true },
        );

        const shouldGenerateNotifications =
          runUpsertResult.upsertedCount === 1 ||
          runUpsertResult.upsertedId !== null;

        if (shouldGenerateNotifications) {
          const [serviceRecords, leadRecords, financialYears] =
            await Promise.all([
              servicesCollection
                .find(
                  { isDeleted: { $ne: true } },
                  {
                    projection: {
                      _id: 1,
                      id: 1,
                      serviceNumber: 1,
                      businessName: 1,
                      transactions: 1,
                    },
                  },
                )
                .toArray(),
              leadsCollection
                .find(
                  { isDeleted: { $ne: true } },
                  {
                    projection: {
                      _id: 1,
                      id: 1,
                      leadName: 1,
                      businessName: 1,
                      phoneNumber: 1,
                      whatsappNumber: 1,
                      followUpDate: 1,
                      status: 1,
                      isDeleted: 1,
                    },
                  },
                )
                .toArray(),
              yearsCollection
                .find(
                  { isDeleted: { $ne: true } },
                  {
                    projection: {
                      _id: 1,
                      id: 1,
                      startDate: 1,
                      endDate: 1,
                      taxPercentage: 1,
                      isDeleted: 1,
                    },
                  },
                )
                .toArray(),
            ]);

          const serviceNotifications = buildServiceHistoryExpiryNotifications({
            serviceRecords,
            financialYears,
            today,
          });

          const leadFollowUpNotifications = buildLeadFollowUpNotifications({
            leadRecords,
            today,
          });

          const generatedNotifications = [
            ...serviceNotifications,
            ...leadFollowUpNotifications,
          ];

          if (generatedNotifications.length > 0) {
            const existingToday = await notificationsCollection
              .find(
                {
                  dateKey,
                  isDeleted: { $ne: true },
                },
                { projection: { dedupeKey: 1 } },
              )
              .toArray();

            const existingKeys = new Set(
              existingToday
                .map((row) => row?.dedupeKey)
                .filter((dedupeKey) => typeof dedupeKey === "string"),
            );

            const now = new Date();
            const docsToInsert = generatedNotifications
              .filter(
                (notification) => !existingKeys.has(notification.dedupeKey),
              )
              .map((notification) => ({
                ...notification,
                dateKey,
                read: false,
                readBy: [],
                isDeleted: false,
                createdAt: now,
                updatedAt: now,
              }));

            if (docsToInsert.length > 0) {
              await notificationsCollection.insertMany(docsToInsert);
            }
          }

          await notificationRunsCollection.updateOne(
            { dateKey, notificationType },
            {
              $set: {
                generatedCount: generatedNotifications.length,
                generatedByUserId: currentUserId,
                generatedByRole: decodedToken?.role || "unknown",
                updatedAt: new Date(),
              },
            },
          );
        }
      }

      const notifications = await notificationsCollection
        .find(
          { isDeleted: { $ne: true } },
          {
            projection: {
              _id: 1,
              title: 1,
              description: 1,
              icon: 1,
              type: 1,
              image: 1,
              templateType: 1,
              templateData: 1,
              links: 1,
              readBy: 1,
              createdAt: 1,
            },
          },
        )
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .toArray();

      const responseNotifications = notifications
        .map((item) => {
          const readBy = normalizeReadBy(item.readBy);
          return {
            id: String(item._id),
            title: item.title,
            description: item.description,
            icon: item.icon,
            type: item.type,
            image: item.image,
            templateType: item.templateType,
            templateData: item.templateData || {},
            links: Array.isArray(item.links) ? item.links : [],
            read: hasUserReadNotification(readBy, currentUserId),
            readBy,
            createdAt: item.createdAt,
          };
        })
        .sort((a, b) => {
          if (a.read !== b.read) return a.read ? 1 : -1;
          return (
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime()
          );
        });

      const unreadCount = responseNotifications.filter(
        (item) => !item.read,
      ).length;

      const responsePayload = {
        dateKey,
        limit: limitNum,
        unreadCount,
        notifications: responseNotifications,
      };

      notificationResponseCache.set(cacheKey, {
        payload: responsePayload,
        expiresAt: Date.now() + NOTIFICATION_RESPONSE_CACHE_TTL_MS,
      });

      return createResponse(200, responsePayload, origin);
    }

    if (event.httpMethod === "PATCH") {
      notificationResponseCache = new Map();
      const body = JSON.parse(event.body || "{}");
      const { action, id, read } = body;
      const currentUserId = resolveCurrentUserId(decodedToken);

      if (!currentUserId) {
        return createResponse(
          401,
          { error: "Unauthorized: user id missing in token" },
          origin,
        );
      }

      let actor = null;
      if (ObjectId.isValid(currentUserId)) {
        actor = await usersCollection.findOne(
          { _id: new ObjectId(currentUserId) },
          { projection: { name: 1, role: 1 } },
        );
      }

      const readEntry = {
        userId: currentUserId,
        name: actor?.name || decodedToken?.name || "",
        role: actor?.role || decodedToken?.role || "",
        readAt: new Date(),
      };

      if (action === "markAllRead") {
        const unreadNotifications = await notificationsCollection
          .find(
            {
              isDeleted: { $ne: true },
              "readBy.userId": { $ne: currentUserId },
            },
            { projection: { _id: 1 } },
          )
          .toArray();

        if (unreadNotifications.length > 0) {
          await notificationsCollection.bulkWrite(
            unreadNotifications.map((item) => ({
              updateOne: {
                filter: {
                  _id: item._id,
                  isDeleted: { $ne: true },
                  "readBy.userId": { $ne: currentUserId },
                },
                update: {
                  $push: { readBy: readEntry },
                  $set: { updatedAt: new Date() },
                },
              },
            })),
          );
        }

        return createResponse(
          200,
          {
            message: "All notifications marked as read",
            markedCount: unreadNotifications.length,
          },
          origin,
        );
      }

      if (!id || !ObjectId.isValid(id)) {
        return createResponse(
          400,
          { error: "Valid notification id is required" },
          origin,
        );
      }

      const shouldRead = read !== false;

      let result;

      if (shouldRead) {
        result = await notificationsCollection.updateOne(
          {
            _id: new ObjectId(id),
            isDeleted: { $ne: true },
            "readBy.userId": { $ne: currentUserId },
          },
          {
            $push: { readBy: readEntry },
            $set: { updatedAt: new Date() },
          },
        );

        if (result.matchedCount === 0) {
          result = await notificationsCollection.updateOne(
            {
              _id: new ObjectId(id),
              isDeleted: { $ne: true },
            },
            {
              $set: { updatedAt: new Date() },
            },
          );
        }
      } else {
        result = await notificationsCollection.updateOne(
          {
            _id: new ObjectId(id),
            isDeleted: { $ne: true },
          },
          {
            $pull: { readBy: { userId: currentUserId } },
            $set: { updatedAt: new Date() },
          },
        );
      }

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Notification not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Notification updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      notificationResponseCache = new Map();
      const { id } = event.queryStringParameters || {};

      if (!id || !ObjectId.isValid(id)) {
        return createResponse(
          400,
          { error: "Valid notification id is required" },
          origin,
        );
      }

      const result = await notificationsCollection.updateOne(
        {
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Notification not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Notification deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Notification API Error:", error);

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(
        401,
        {
          error: "Unauthorized",
          message: error.message,
        },
        origin,
      );
    }

    return createResponse(
      500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin,
    );
  }
}
