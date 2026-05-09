import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import { sendPaymentVerificationNotification } from "./utils/payment-verification-whatsapp.js";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value = "") => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (raw === "success") return "success";
  if (raw === "failed") return "failed";
  if (raw === "under_verification" || raw === "under verification") {
    return "under_verification";
  }
  if (raw === "expired") return "expired";
  return "pending";
};

const normalizeDomain = (value = "") => {
  const allowed = [
    "https://billing.maxcode.in",
    "https://pay.maxcode.in",
    "http://localhost:5173",
  ];

  const normalized = String(value || "").trim();
  if (allowed.includes(normalized)) return normalized;
  return allowed[0];
};

const cleanAlias = (value = "") => {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
};

const normalizeLinkExpiryToEndOfDay = (value) => {
  if (!value) return null;

  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);

  if (match) {
    const endOfDayIst = new Date(`${match[1]}T23:59:59.999+05:30`);
    return Number.isNaN(endOfDayIst.getTime()) ? null : endOfDayIst;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const endOfDayIst = new Date(`${year}-${month}-${day}T23:59:59.999+05:30`);

  return Number.isNaN(endOfDayIst.getTime()) ? null : endOfDayIst;
};

const normalizePaymentDate = (value) => {
  if (!value) return null;

  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);

  if (match) {
    const startOfDayIst = new Date(`${match[1]}T00:00:00.000+05:30`);
    return Number.isNaN(startOfDayIst.getTime()) ? null : startOfDayIst;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const startOfDayIst = new Date(`${year}-${month}-${day}T00:00:00.000+05:30`);

  return Number.isNaN(startOfDayIst.getTime()) ? null : startOfDayIst;
};

const normalizeDateRangeBoundary = (value, endOfDay = false) => {
  if (!value) return null;

  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;

  const timePart = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const boundary = new Date(`${match[1]}T${timePart}+05:30`);
  return Number.isNaN(boundary.getTime()) ? null : boundary;
};

const resolveStatusByExpiry = (statusValue = "pending", linkExpiry = null) => {
  const requestedStatus = normalizeStatus(statusValue);

  // Keep terminal/manual result states intact.
  if (
    requestedStatus === "success" ||
    requestedStatus === "failed" ||
    requestedStatus === "under_verification"
  ) {
    return requestedStatus;
  }

  if (!linkExpiry) {
    return "pending";
  }

  const expiry = new Date(linkExpiry);
  if (Number.isNaN(expiry.getTime())) {
    return "pending";
  }

  return expiry.getTime() < Date.now() ? "expired" : "pending";
};

const sanitizePayload = (payload = {}) => {
  const domain = normalizeDomain(payload.domain);
  const alias = cleanAlias(payload.alias);
  const linkExpiry = normalizeLinkExpiryToEndOfDay(payload.linkExpiry);
  const status = resolveStatusByExpiry(payload.status, linkExpiry);

  return {
    recordId: String(payload.recordId || payload.id || "").trim(),
    clientRefId: String(payload.clientRefId || "").trim(),
    clientName: String(payload.clientName || "").trim(),
    businessName: String(payload.businessName || "").trim(),
    phoneNumber: String(payload.phoneNumber || "").trim(),
    address: String(payload.address || "").trim(),
    accountName: String(payload.accountName || "").trim(),
    upiId: String(payload.upiId || "")
      .trim()
      .toLowerCase(),
    amount: Math.max(0, toNumber(payload.amount)),
    domain,
    alias,
    shareUrl: alias ? `${domain}/${alias}` : "",
    status,
    paymentDate: normalizePaymentDate(payload.paymentDate),
    utrNumber: String(payload.utrNumber || "").trim(),
    failedReason: String(payload.failedReason || "").trim(),
    linkExpiry,
    note: String(payload.note || "").trim(),
    temporaryClient: payload.temporaryClient === true,
  };
};

const isExpired = (record = {}) => {
  if (!record?.linkExpiry) return false;
  const expiry = new Date(record.linkExpiry);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() < Date.now();
};

const projectRecord = (record = {}) => {
  const resolvedStatus =
    normalizeStatus(record.status) === "pending" && isExpired(record)
      ? "expired"
      : normalizeStatus(record.status);

  return {
    ...record,
    id: String(record._id || record.id || ""),
    status: resolvedStatus,
    shareUrl:
      record.shareUrl ||
      (record.domain && record.alias ? `${record.domain}/${record.alias}` : ""),
  };
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection("payment_links");

    if (event.httpMethod === "GET") {
      const {
        id,
        alias,
        action,
        page = 1,
        limit = 20,
        search = "",
        excludeId = "",
        createdAt_start,
        createdAt_end,
        linkExpiry_start,
        linkExpiry_end,
        paymentDate_start,
        paymentDate_end,
      } = event.queryStringParameters || {};

      if (action === "check-alias") {
        verifyRequestToken(event);

        const normalizedAlias = cleanAlias(alias);
        const normalizedDomain = normalizeDomain(
          event.queryStringParameters?.domain,
        );

        if (!normalizedAlias) {
          return createResponse(400, { error: "Alias is required" }, origin);
        }

        const shareUrl = `${normalizedDomain}/${normalizedAlias}`;
        const checkQuery = {
          shareUrl,
          isDeleted: { $ne: true },
        };

        if (excludeId && ObjectId.isValid(excludeId)) {
          checkQuery._id = { $ne: new ObjectId(excludeId) };
        }

        const existing = await collection.findOne(checkQuery);

        return createResponse(
          200,
          {
            available: !existing,
            shareUrl,
          },
          origin,
        );
      }

      if (action === "public") {
        const normalizedAlias = cleanAlias(alias);
        if (!normalizedAlias) {
          return createResponse(400, { error: "Alias is required" }, origin);
        }

        const businessSettingsCollection = db.collection("business_settings");
        const brandingSettings =
          (await businessSettingsCollection.findOne({ scope: "global" })) ||
          (await businessSettingsCollection.findOne(
            {},
            {
              sort: {
                updatedAt: -1,
                createdAt: -1,
                _id: -1,
              },
            },
          ));

        const record = await collection.findOne({
          alias: normalizedAlias,
          isDeleted: { $ne: true },
        });

        if (!record) {
          return createResponse(
            404,
            { error: "Payment link not found" },
            origin,
          );
        }

        return createResponse(
          200,
          {
            record: projectRecord(record),
            branding: {
              companyName:
                brandingSettings?.companyName || "MaxCode IT Services",
              logoUrl: brandingSettings?.logoUrl || "",
              companyPhone: brandingSettings?.companyPhone || "",
            },
          },
          origin,
        );
      }

      verifyRequestToken(event);

      if (id) {
        const filter = ObjectId.isValid(id)
          ? { _id: new ObjectId(id), isDeleted: { $ne: true } }
          : { id: id, isDeleted: { $ne: true } };

        const record = await collection.findOne(filter);
        if (!record) {
          return createResponse(
            404,
            { error: "Payment link not found" },
            origin,
          );
        }

        return createResponse(200, { record: projectRecord(record) }, origin);
      }

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
      const skip = (pageNum - 1) * limitNum;

      const query = {
        isDeleted: { $ne: true },
      };

      if (search) {
        query.$or = [
          { alias: { $regex: search, $options: "i" } },
          { clientName: { $regex: search, $options: "i" } },
          { businessName: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
          { upiId: { $regex: search, $options: "i" } },
          { accountName: { $regex: search, $options: "i" } },
        ];
      }

      const createdAtStart = normalizeDateRangeBoundary(createdAt_start);
      const createdAtEnd = normalizeDateRangeBoundary(createdAt_end, true);
      if (createdAtStart || createdAtEnd) {
        query.createdAt = {};
        if (createdAtStart) query.createdAt.$gte = createdAtStart;
        if (createdAtEnd) query.createdAt.$lte = createdAtEnd;
      }

      const linkExpiryStart = normalizeDateRangeBoundary(linkExpiry_start);
      const linkExpiryEnd = normalizeDateRangeBoundary(linkExpiry_end, true);
      if (linkExpiryStart || linkExpiryEnd) {
        query.linkExpiry = {};
        if (linkExpiryStart) query.linkExpiry.$gte = linkExpiryStart;
        if (linkExpiryEnd) query.linkExpiry.$lte = linkExpiryEnd;
      }

      const paymentDateStart = normalizeDateRangeBoundary(paymentDate_start);
      const paymentDateEnd = normalizeDateRangeBoundary(paymentDate_end, true);
      if (paymentDateStart || paymentDateEnd) {
        query.paymentDate = {};
        if (paymentDateStart) query.paymentDate.$gte = paymentDateStart;
        if (paymentDateEnd) query.paymentDate.$lte = paymentDateEnd;
      }

      const statusCountQueryBase = {
        ...query,
      };
      delete statusCountQueryBase.status;

      const [
        rows,
        total,
        pendingCount,
        successCount,
        failedCount,
        underVerificationCount,
      ] = await Promise.all([
        collection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .toArray(),
        collection.countDocuments(query),
        collection.countDocuments({
          ...statusCountQueryBase,
          status: "pending",
        }),
        collection.countDocuments({
          ...statusCountQueryBase,
          status: "success",
        }),
        collection.countDocuments({
          ...statusCountQueryBase,
          status: "failed",
        }),
        collection.countDocuments({
          ...statusCountQueryBase,
          status: "under_verification",
        }),
      ]);

      const records = rows.map(projectRecord);
      const expiredCount = Math.max(
        0,
        total -
          pendingCount -
          successCount -
          failedCount -
          underVerificationCount,
      );

      const statistics = {
        total,
        pending: pendingCount,
        success: successCount,
        failed: failedCount,
        underVerification: underVerificationCount,
        expired: expiredCount,
      };

      return createResponse(
        200,
        {
          records,
          total,
          statistics,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            totalRecords: total,
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      verifyRequestToken(event);
      const payload = sanitizePayload(JSON.parse(event.body || "{}"));

      if (!payload.clientName) {
        return createResponse(
          400,
          { error: "Client name is required" },
          origin,
        );
      }
      if (!payload.upiId) {
        return createResponse(400, { error: "UPI ID is required" }, origin);
      }
      if (!payload.accountName) {
        return createResponse(
          400,
          { error: "Account name is required" },
          origin,
        );
      }
      if (!payload.alias) {
        return createResponse(400, { error: "Alias is required" }, origin);
      }
      if (payload.amount <= 0) {
        return createResponse(
          400,
          { error: "Amount must be greater than 0" },
          origin,
        );
      }

      const existingAlias = await collection.findOne({
        shareUrl: payload.shareUrl,
        isDeleted: { $ne: true },
      });
      if (existingAlias) {
        return createResponse(
          409,
          { error: "Payment URL already exists" },
          origin,
        );
      }

      const now = new Date();
      const doc = {
        ...payload,
        createdAt: now,
        updatedAt: now,
        ...getAuditFieldsFromEvent(event, "create"),
      };

      const result = await collection.insertOne(doc);
      return createResponse(
        201,
        {
          message: "Payment link created successfully",
          id: String(result.insertedId),
          record: projectRecord({ ...doc, _id: result.insertedId }),
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { action, alias } = event.queryStringParameters || {};

      if (action === "public-verify") {
        const normalizedAlias = cleanAlias(alias);
        const body = JSON.parse(event.body || "{}");
        const enteredUtr = String(body?.utrNumber || "").trim();

        if (!normalizedAlias) {
          return createResponse(400, { error: "Alias is required" }, origin);
        }

        if (!enteredUtr) {
          return createResponse(
            400,
            { error: "Transaction ID / UTR Number is required" },
            origin,
          );
        }

        const existingRecord = await collection.findOne({
          alias: normalizedAlias,
          isDeleted: { $ne: true },
        });

        if (!existingRecord) {
          return createResponse(
            404,
            { error: "Payment link not found" },
            origin,
          );
        }

        const currentStatus = normalizeStatus(existingRecord.status);
        if (currentStatus === "success" || currentStatus === "failed") {
          return createResponse(
            409,
            {
              error: "Payment already finalized",
              status: currentStatus,
              record: projectRecord(existingRecord),
            },
            origin,
          );
        }

        const now = new Date();
        const updateResult = await collection.findOneAndUpdate(
          {
            _id: existingRecord._id,
            isDeleted: { $ne: true },
          },
          {
            $set: {
              utrNumber: enteredUtr,
              status: "under_verification",
              paymentDate: now,
              updatedAt: now,
            },
          },
          { returnDocument: "after" },
        );

        const updatedRecord = updateResult?.value ?? updateResult;
        if (!updatedRecord) {
          return createResponse(
            404,
            { error: "Payment link not found" },
            origin,
          );
        }

        let whatsappNotification = { success: false, skipped: true };
        try {
          whatsappNotification = await sendPaymentVerificationNotification({
            db,
            record: updatedRecord,
          });
        } catch (notificationError) {
          console.error(
            "Payment verification WhatsApp send failed:",
            notificationError,
          );
          whatsappNotification = {
            success: false,
            error: notificationError?.message || "WhatsApp send failed",
          };
        }

        return createResponse(
          200,
          {
            message: "Verification request submitted",
            record: projectRecord(updatedRecord),
            whatsappNotification,
          },
          origin,
        );
      }

      verifyRequestToken(event);
      const payload = sanitizePayload(JSON.parse(event.body || "{}"));
      const { id } = event.queryStringParameters || {};
      const targetId = String(
        id || payload.recordId || payload.id || "",
      ).trim();

      if (!targetId) {
        return createResponse(400, { error: "Valid ID is required" }, origin);
      }

      const updateMatchConditions = [{ id: targetId }];
      if (ObjectId.isValid(targetId)) {
        updateMatchConditions.push({ _id: new ObjectId(targetId) });
      }

      const updateFilter = {
        $or: updateMatchConditions,
        isDeleted: { $ne: true },
      };

      if (!payload.clientName) {
        return createResponse(
          400,
          { error: "Client name is required" },
          origin,
        );
      }
      if (!payload.upiId) {
        return createResponse(400, { error: "UPI ID is required" }, origin);
      }
      if (!payload.accountName) {
        return createResponse(
          400,
          { error: "Account name is required" },
          origin,
        );
      }
      if (!payload.alias) {
        return createResponse(400, { error: "Alias is required" }, origin);
      }
      if (payload.amount <= 0) {
        return createResponse(
          400,
          { error: "Amount must be greater than 0" },
          origin,
        );
      }

      // Check duplicate alias while excluding the current record for both id types.
      const excludeCurrentConditions = [{ id: targetId }];
      if (ObjectId.isValid(targetId)) {
        excludeCurrentConditions.push({ _id: new ObjectId(targetId) });
      }

      const aliasCheckFilter = {
        shareUrl: payload.shareUrl,
        isDeleted: { $ne: true },
        $nor: excludeCurrentConditions,
      };

      const existingAlias = await collection.findOne(aliasCheckFilter);
      if (existingAlias) {
        return createResponse(
          409,
          { error: "Payment URL already exists" },
          origin,
        );
      }

      const now = new Date();
      const result = await collection.findOneAndUpdate(
        updateFilter,
        {
          $set: {
            ...payload,
            updatedAt: now,
            ...getAuditFieldsFromEvent(event, "update"),
          },
        },
        { returnDocument: "after" },
      );

      const updatedRecord = result?.value ?? result;
      if (!updatedRecord) {
        return createResponse(404, { error: "Payment link not found" }, origin);
      }

      return createResponse(
        200,
        {
          message: "Payment link updated successfully",
          record: projectRecord(updatedRecord),
        },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      verifyRequestToken(event);
      const { id } = event.queryStringParameters || {};
      const targetId = String(id || "").trim();

      if (!targetId) {
        return createResponse(400, { error: "Valid ID is required" }, origin);
      }

      // Build filter: try ObjectId first, then fallback to string id (for data consistency)
      let filter;
      if (ObjectId.isValid(targetId)) {
        filter = { _id: new ObjectId(targetId), isDeleted: { $ne: true } };
      } else {
        filter = { id: targetId, isDeleted: { $ne: true } };
      }

      const now = new Date();
      const result = await collection.updateOne(filter, {
        $set: {
          isDeleted: true,
          deletedAt: now,
          updatedAt: now,
          ...getAuditFieldsFromEvent(event, "delete"),
        },
      });

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Payment link not found" }, origin);
      }

      return createResponse(200, { message: "Payment link deleted" }, origin);
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Payment Links API Error:", error);
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
