import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

const ALERT_DAYS = [15, 10, 7, 3, 2, 1];
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

const buildServiceExpiryNotifications = ({
  serviceRecords = [],
  financialYears = [],
  today,
}) => {
  const notifications = [];

  serviceRecords.forEach((record) => {
    const serviceRows = Array.isArray(record?.services) ? record.services : [];

    serviceRows.forEach((service, index) => {
      if (!service?.sendAlert || !service?.expiryDate) return;

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
      const dedupeKey = `service-expiry-${recordIdentifier}-${rowIdentifier}-${service.expiryDate}-${daysRemaining}`;

      notifications.push({
        dedupeKey,
        title: "📢 Subsctiption Expiry Reminder",
        description: `${service.serviceName || "Service"} Subsciption for ${record.businessName || "Business"} is Expirying in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""}. Expiry Date: ${formatDateForDisplay(service.expiryDate)}, Price: ${formatCurrency(price)}, Tax ${taxPercentage}%: ${formatCurrency(taxAmount)}, Total Amount ${formatCurrency(totalAmount)}. Please take necessary action to renew or notify the client.`,
        icon: "bullhorn",
        type: daysRemaining <= 3 ? "danger" : "warning",
        image: "https://img.maxcodehub.com/Ex.png",
        templateType: "service-expiry",
        templateData: {
          serviceName: service.serviceName || "Service",
          businessName: record.businessName || "Business",
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
    const yearsCollection = db.collection("financialYears");
    const usersCollection = db.collection("users");

    if (event.httpMethod === "GET") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dateKey = getDateString(today);
      const notificationType = "service-expiry";

      const runRecord = await notificationRunsCollection.findOne({
        dateKey,
        notificationType,
      });

      if (!runRecord) {
        const [serviceRecords, financialYears] = await Promise.all([
          servicesCollection.find({ isDeleted: { $ne: true } }).toArray(),
          yearsCollection.find({ isDeleted: { $ne: true } }).toArray(),
        ]);

        const generatedNotifications = buildServiceExpiryNotifications({
          serviceRecords,
          financialYears,
          today,
        });

        if (generatedNotifications.length > 0) {
          const existingToday = await notificationsCollection
            .find(
              {
                dateKey,
                templateType: notificationType,
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
            .filter((notification) => !existingKeys.has(notification.dedupeKey))
            .map((notification) => ({
              ...notification,
              dateKey,
              read: false,
              isDeleted: false,
              createdAt: now,
              updatedAt: now,
            }));

          if (docsToInsert.length > 0) {
            await notificationsCollection.insertMany(docsToInsert);
          }
        }

        await notificationRunsCollection.insertOne({
          dateKey,
          notificationType,
          generatedCount: generatedNotifications.length,
          generatedByUserId: decodedToken?.userId || null,
          generatedByRole: decodedToken?.role || "unknown",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const userId = decodedToken?.userId;
      if (userId && ObjectId.isValid(userId)) {
        const loggedInUser = await usersCollection.findOne(
          { _id: new ObjectId(userId) },
          { projection: { showNotification: 1 } },
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

      const notifications = await notificationsCollection
        .find({ isDeleted: { $ne: true } })
        .sort({ read: 1, createdAt: -1 })
        .toArray();

      const responseNotifications = notifications.map((item) => ({
        id: String(item._id),
        title: item.title,
        description: item.description,
        icon: item.icon,
        type: item.type,
        image: item.image,
        templateType: item.templateType,
        templateData: item.templateData || {},
        links: Array.isArray(item.links) ? item.links : [],
        read: Boolean(item.read),
        createdAt: item.createdAt,
      }));

      const unreadCount = responseNotifications.filter(
        (item) => !item.read,
      ).length;

      return createResponse(
        200,
        {
          dateKey,
          unreadCount,
          notifications: responseNotifications,
        },
        origin,
      );
    }

    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const { action, id, read } = body;

      if (action === "markAllRead") {
        await notificationsCollection.updateMany(
          {
            isDeleted: { $ne: true },
            read: { $ne: true },
          },
          {
            $set: {
              read: true,
              readAt: new Date(),
              updatedAt: new Date(),
            },
          },
        );

        return createResponse(
          200,
          { message: "All notifications marked as read" },
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

      const result = await notificationsCollection.updateOne(
        {
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        },
        {
          $set: {
            read: shouldRead,
            readAt: shouldRead ? new Date() : null,
            updatedAt: new Date(),
          },
        },
      );

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
