import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { ObjectId } from "mongodb";
import crypto from "crypto";
import { decryptSecretFromStorage } from "./utils/secret-crypto.js";

const OTP_REQUESTS_COLLECTION = "otpRequests";
const OTP_GRANTS_COLLECTION = "otpAccessGrants";
const BUSINESS_SETTINGS_COLLECTION = "business_settings";
const CLIENTS_COLLECTION = "clients";
const GLOBAL_SETTINGS_SCOPE = "global";

const OTP_DIGITS = 6;
const OTP_EXPIRES_MS = 10 * 60 * 1000;
const OTP_VERIFY_WINDOW_MS = 60 * 1000;
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;
const ACCESS_GRANT_MS = 15 * 60 * 1000;
const MAX_TOTAL_SENDS = 3;
const RESEND_LOCK_MS = 30 * 60 * 1000;
const MAX_WRONG_ATTEMPTS = 3;
const WRONG_ATTEMPT_BLOCK_MS = 15 * 60 * 1000;

const normalizeRole = (role = "") =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

const resolveActorFromToken = (decoded = {}) => {
  const userId = String(
    decoded?.userId || decoded?.id || decoded?._id || "",
  ).trim();
  const name = String(
    decoded?.name || decoded?.userName || decoded?.email || userId,
  ).trim();
  const role = String(decoded?.role || "").trim();

  return {
    userId,
    name: name || userId,
    role,
  };
};

const formatPersonDisplayName = (name = "", phone = "") => {
  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "")
    .replace(/\D+/g, "")
    .slice(-10);

  if (cleanName && cleanPhone) return `${cleanName} - ${cleanPhone}`;
  if (cleanName) return cleanName;
  if (cleanPhone) return cleanPhone;
  return "Team Member";
};

const GENERIC_SENDER_LABELS = new Set([
  "team member",
  "guest user",
  "user",
  "member",
]);

const isEmailLike = (value = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const normalizeNameCandidate = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return "";

  if (isEmailLike(text)) {
    return text
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase())
      .trim();
  }

  return text;
};

const resolvePreferredSenderName = ({
  payloadSenderName = "",
  profileName = "",
  actorName = "",
}) => {
  const payloadCandidate = normalizeNameCandidate(payloadSenderName);
  if (
    payloadCandidate &&
    !GENERIC_SENDER_LABELS.has(payloadCandidate.toLowerCase())
  ) {
    return payloadCandidate;
  }

  const profileCandidate = normalizeNameCandidate(profileName);
  if (
    profileCandidate &&
    !GENERIC_SENDER_LABELS.has(profileCandidate.toLowerCase())
  ) {
    return profileCandidate;
  }

  const actorCandidate = normalizeNameCandidate(actorName);
  if (actorCandidate) return actorCandidate;

  return "Team Member";
};

const resolveAuthenticatedUserProfile = async (db, actor = {}) => {
  const usersCollection = db.collection("users");
  const candidateQueries = [];

  if (actor.userId && ObjectId.isValid(actor.userId)) {
    candidateQueries.push({ _id: new ObjectId(actor.userId) });
  }

  if (actor.userId) {
    candidateQueries.push({ _id: actor.userId });
  }

  if (actor.name) {
    candidateQueries.push(
      { name: actor.name },
      { userName: actor.name },
      { username: actor.name },
      { email: actor.name },
      { phone: actor.name },
      { mobile: actor.name },
    );
  }

  for (const query of candidateQueries) {
    try {
      const user = await usersCollection.findOne(query);
      if (user) {
        const resolvedName = String(
          user.name ||
            user.fullName ||
            user.displayName ||
            user.userName ||
            user.username ||
            actor.name ||
            "",
        ).trim();
        const resolvedPhone = String(
          user.phone ||
            user.mobile ||
            user.phoneNumber ||
            user.whatsappNumber ||
            "",
        )
          .replace(/\D+/g, "")
          .slice(-10);

        return {
          name: resolvedName,
          phone: resolvedPhone,
          displayName: formatPersonDisplayName(resolvedName, resolvedPhone),
        };
      }
    } catch {
      // try next candidate
    }
  }

  const fallbackName = String(actor.name || "").trim();
  return {
    name: fallbackName,
    phone: "",
    displayName: fallbackName || "Team Member",
  };
};

const buildOtpHash = (otp = "", salt = "") => {
  let secret = String(process.env.OTP_HASH_SECRET || "").trim();

  // Fallback: use a deterministic secret based on salt if not provided
  if (!secret) {
    secret = `maxcode-otp-${salt.slice(0, 8).toUpperCase()}`;
  }

  return crypto
    .createHash("sha256")
    .update(`${otp}:${salt}:${secret}`)
    .digest("hex");
};

const generateOtp = () => {
  const min = 10 ** (OTP_DIGITS - 1);
  const max = 10 ** OTP_DIGITS - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};

const normalizePhoneToWhatsApp = (value = "") => {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }

  return digits;
};

const toIso = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

const resolveGlobalBusinessSettings = async (db) => {
  const settingsCollection = db.collection(BUSINESS_SETTINGS_COLLECTION);
  const globalSettings = await settingsCollection.findOne({
    scope: GLOBAL_SETTINGS_SCOPE,
  });

  if (globalSettings) return globalSettings;

  return settingsCollection.findOne(
    {},
    {
      sort: {
        updatedAt: -1,
        createdAt: -1,
        _id: -1,
      },
    },
  );
};

const getWhatsAppConfig = async (db) => {
  const settings = await resolveGlobalBusinessSettings(db);
  const wa = settings?.whatsappSettings || {};

  return {
    accessToken: decryptSecretFromStorage(String(wa.accessToken || "").trim()),
    appId: decryptSecretFromStorage(String(wa.appId || "").trim()),
    phoneNumberId: decryptSecretFromStorage(
      String(wa.phoneNumberId || "").trim(),
    ),
    businessAccountId: decryptSecretFromStorage(
      String(wa.businessAccountId || "").trim(),
    ),
    founderCeoPhoneNumber: normalizePhoneToWhatsApp(wa.founderCeoPhoneNumber),
    companyName: String(settings?.companyName || "").trim(),
  };
};

const sendTemplateMessage = async ({
  accessToken,
  phoneNumberId,
  to,
  variables,
}) => {
  const endpoint = `https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "software_details",
      language: {
        code: "en",
      },
      components: [
        {
          type: "body",
          parameters: variables.map((item) => ({
            type: "text",
            text: String(item || ""),
          })),
        },
      ],
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    throw new Error(parsed?.error?.message || "WhatsApp message send failed");
  }

  return parsed;
};

const resolveClientByIdOrRef = async (db, rawValue = "") => {
  const clientsCollection = db.collection(CLIENTS_COLLECTION);
  const value = String(rawValue || "").trim();
  if (!value) return null;

  if (ObjectId.isValid(value)) {
    const byObjectId = await clientsCollection.findOne({
      _id: new ObjectId(value),
      isDeleted: { $ne: true },
    });
    if (byObjectId) return byObjectId;
  }

  return clientsCollection.findOne({
    clientId: value,
    isDeleted: { $ne: true },
  });
};

const collectRecipients = ({ recipientMode, founderPhone, clientRecord }) => {
  const mode = String(recipientMode || "")
    .trim()
    .toLowerCase();
  const recipients = [];

  const clientPhone = normalizePhoneToWhatsApp(
    clientRecord?.phoneNumber || clientRecord?.whatsappNumber || "",
  );

  if (mode === "founder" || mode === "both") {
    const normalizedFounder = normalizePhoneToWhatsApp(founderPhone);
    if (!normalizedFounder) {
      throw new Error(
        "Founder & CEO phone number is not configured in settings",
      );
    }

    recipients.push({
      recipientType: "founder",
      recipientLabel: "Founder & CEO",
      phone: normalizedFounder,
      clientName:
        clientRecord?.clientName || clientRecord?.businessName || "Client",
    });
  }

  if (mode === "client" || mode === "both") {
    if (!clientRecord) {
      throw new Error("Client selection is required for client OTP delivery");
    }

    if (!clientPhone) {
      throw new Error("Selected client does not have a valid phone number");
    }

    recipients.push({
      recipientType: "client",
      recipientLabel: `${clientRecord?.clientName || "Client"} - ${clientRecord?.businessName || ""}`,
      phone: clientPhone,
      clientName:
        clientRecord?.clientName || clientRecord?.businessName || "Client",
    });
  }

  if (!recipients.length) {
    throw new Error("Please select at least one OTP recipient");
  }

  return recipients;
};

const buildTemplateVariables = ({
  clientName,
  senderName,
  senderPhoneNumber,
  purpose,
  otp,
}) => {
  const cleanSenderName = String(senderName || "").trim();
  const cleanSenderPhone = String(senderPhoneNumber || "")
    .replace(/\D+/g, "")
    .slice(-10);
  const senderNameDigits = cleanSenderName.replace(/\D+/g, "");
  const alreadyContainsPhone =
    Boolean(cleanSenderPhone) && senderNameDigits.endsWith(cleanSenderPhone);

  const formattedSenderName = cleanSenderPhone
    ? alreadyContainsPhone
      ? cleanSenderName
      : `${cleanSenderName} - ${cleanSenderPhone}`
    : cleanSenderName;

  return [
    String(clientName || "").trim() || "Client",
    formattedSenderName || "Team Member",
    "Software Credentials",
    String(purpose || "").trim() || "No purpose provided",
    `Your verification code is: ${otp}`,
    "Share this OTP only if you approve this request and receive a call from the above number.",
    "⚠️ Do not share this OTP with anyone else.",
    "If unauthorized",
  ];
};

const formatCredentialTypeLabel = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  if (normalized === "my-software-credential") return "My Software Credential";
  if (normalized === "project-credentials") return "Project Credentials";

  return normalized
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const formatStatusLabel = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "Pending";

  if (normalized === "otp_sent") return "OTP Send Success";
  if (normalized === "verified") return "Verified";
  if (normalized === "expired") return "Expired";
  if (normalized === "blocked_wrong_attempts") return "Blocked";
  if (normalized === "resend_locked") return "Resend Locked";
  if (normalized === "send_failed") return "Failed";
  if (normalized === "pending") return "Pending";

  return normalized
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const formatDisplayName = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.includes("@") && !text.includes(" ")) {
    return text
      .split("@")[0]
      .replace(/[._]+/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }
  return text.replace(/\b\w/g, (match) => match.toUpperCase());
};

const buildSentToLabel = (recipients = []) =>
  Array.isArray(recipients)
    ? recipients
        .map((item) => String(item?.recipientLabel || "").trim())
        .filter(Boolean)
        .join(", ")
    : "";

const shapeRequestRow = (row = {}) => ({
  id: String(row._id || ""),
  requestDateTime: toIso(row.requestedAt || row.createdAt),
  requestBy: formatDisplayName(row.requestedByName || ""),
  requestByRole: row.requestedByRole || "",
  requestById: row.requestedById || "",
  clientName:
    formatDisplayName(row.clientName || "") ||
    (row.credentialType === "my-software-credential"
      ? formatDisplayName(row.requestedByName || "")
      : "Client"),
  clientBusinessName:
    String(row.clientBusinessName || "").trim() ||
    (row.credentialType === "my-software-credential"
      ? String(row.__settings?.companyName || "").trim()
      : ""),
  projectName: row.projectName || "",
  credentialType: formatCredentialTypeLabel(row.credentialType || ""),
  credentialTypeRaw: row.credentialType || "",
  operation: row.operation || "",
  purpose: row.purpose || "",
  attempt: Number(row.sendCount || 0),
  sentTo: buildSentToLabel(row.recipients),
  otpVerifiedDateTime: toIso(row.verifiedAt),
  status: row.status || "pending",
  statusLabel: formatStatusLabel(row.status || "pending"),
  resendAvailableAt: toIso(row.resendAvailableAt),
  otpExpiresAt: toIso(row.otpExpiresAt),
  verifyWindowUntil: toIso(row.otpVerifyWindowUntil),
  resendLockedUntil: toIso(row.resendLockedUntil),
  blockedUntil: toIso(row.blockedUntil),
  wrongAttempts: Number(row.wrongAttemptCount || 0),
});

const CARD_FILTERS = {
  total: null,
  otpSent: { status: "otp_sent" },
  verified: { status: "verified" },
  expired: { status: "expired" },
  blocked: { status: "blocked_wrong_attempts" },
  resendLocked: { status: "resend_locked" },
};

const escapeRegExp = (value = "") =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildDateRangeFilter = (field, start, end) => {
  const range = {};
  if (start) {
    const startDate = new Date(`${start}T00:00:00.000Z`);
    if (!Number.isNaN(startDate.getTime())) {
      range.$gte = startDate;
    }
  }

  if (end) {
    const endDate = new Date(`${end}T23:59:59.999Z`);
    if (!Number.isNaN(endDate.getTime())) {
      range.$lte = endDate;
    }
  }

  if (!Object.keys(range).length) return null;
  return { [field]: range };
};

const buildFilterQueryFromParams = (query = {}) => {
  const filterQuery = {};
  const andConditions = [];

  const statusAliasMap = {
    "OTP Send Success": "otp_sent",
    Verified: "verified",
    Expired: "expired",
    Blocked: "blocked_wrong_attempts",
    "Resend Locked": "resend_locked",
    Failed: "send_failed",
    Pending: "pending",
  };

  const credentialTypeAliasMap = {
    "My Software Credential": "my-software-credential",
    "Project Credentials": "project-credentials",
  };

  const search = String(query.search || "").trim();
  if (search) {
    const safeSearch = escapeRegExp(search);
    andConditions.push({
      $or: [
        { clientName: { $regex: safeSearch, $options: "i" } },
        { clientBusinessName: { $regex: safeSearch, $options: "i" } },
        { projectName: { $regex: safeSearch, $options: "i" } },
        { purpose: { $regex: safeSearch, $options: "i" } },
        { requestedByName: { $regex: safeSearch, $options: "i" } },
        { "recipients.recipientLabel": { $regex: safeSearch, $options: "i" } },
      ],
    });
  }

  const status = String(query.status || "").trim();
  if (status && status !== "All") {
    andConditions.push({ status: statusAliasMap[status] || status });
  }

  const operation = String(query.operation || "")
    .trim()
    .toLowerCase();
  if (operation && operation !== "all") {
    andConditions.push({ operation });
  }

  const credentialType = String(query.credentialType || "")
    .trim()
    .toLowerCase();
  if (credentialType && credentialType !== "all") {
    const friendlyCredentialType = String(query.credentialType || "").trim();
    andConditions.push({
      credentialType:
        credentialTypeAliasMap[friendlyCredentialType] || credentialType,
    });
  }

  const requestBy = String(query.requestBy || "").trim();
  if (requestBy && requestBy !== "All") {
    andConditions.push({
      requestedByName: {
        $regex: `^${escapeRegExp(requestBy)}$`,
        $options: "i",
      },
    });
  }

  const clientName = String(query.clientName || "").trim();
  if (clientName && clientName !== "All") {
    andConditions.push({
      clientName: { $regex: escapeRegExp(clientName), $options: "i" },
    });
  }

  const clientBusinessName = String(query.clientBusinessName || "").trim();
  if (clientBusinessName && clientBusinessName !== "All") {
    andConditions.push({
      clientBusinessName: {
        $regex: escapeRegExp(clientBusinessName),
        $options: "i",
      },
    });
  }

  const projectName = String(query.projectName || "").trim();
  if (projectName && projectName !== "All") {
    andConditions.push({
      projectName: { $regex: escapeRegExp(projectName), $options: "i" },
    });
  }

  const sentTo = String(query.sentTo || "").trim();
  if (sentTo && sentTo !== "All") {
    andConditions.push({
      "recipients.recipientLabel": {
        $regex: escapeRegExp(sentTo),
        $options: "i",
      },
    });
  }

  const purpose = String(query.purpose || "").trim();
  if (purpose && purpose !== "All") {
    andConditions.push({
      purpose: { $regex: escapeRegExp(purpose), $options: "i" },
    });
  }

  const requestDateRange = buildDateRangeFilter(
    "requestedAt",
    String(query.requestDateTime_start || "").trim(),
    String(query.requestDateTime_end || "").trim(),
  );
  if (requestDateRange) {
    andConditions.push(requestDateRange);
  }

  const verifiedDateRange = buildDateRangeFilter(
    "verifiedAt",
    String(query.otpVerifiedDateTime_start || "").trim(),
    String(query.otpVerifiedDateTime_end || "").trim(),
  );
  if (verifiedDateRange) {
    andConditions.push(verifiedDateRange);
  }

  if (andConditions.length) {
    filterQuery.$and = andConditions;
  }

  return filterQuery;
};

const buildSortSpec = (query = {}) => {
  const sortByRaw = String(query.sortBy || "requestedAt").trim();
  const sortOrderRaw = String(query.sortOrder || "desc")
    .trim()
    .toLowerCase();

  const sortDirection = sortOrderRaw === "asc" ? 1 : -1;
  const sortFieldMap = {
    requestDateTime: "requestedAt",
    otpVerifiedDateTime: "verifiedAt",
    requestBy: "requestedByName",
    clientName: "clientName",
    clientBusinessName: "clientBusinessName",
    projectName: "projectName",
    credentialType: "credentialType",
    operation: "operation",
    purpose: "purpose",
    attempt: "sendCount",
    status: "status",
    requestedAt: "requestedAt",
    verifiedAt: "verifiedAt",
  };

  const resolvedField = sortFieldMap[sortByRaw] || "requestedAt";
  return {
    [resolvedField]: sortDirection,
    _id: -1,
  };
};

const withCardFilter = (baseQuery = {}, cardFilterKey = "total") => {
  const condition = CARD_FILTERS[cardFilterKey] || null;
  if (!condition) return baseQuery;

  if (!baseQuery.$and) {
    return { ...baseQuery, ...condition };
  }

  return {
    ...baseQuery,
    $and: [...baseQuery.$and, condition],
  };
};

const uniqSorted = (values = []) =>
  [
    ...new Set(values.map((item) => String(item || "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const decoded = verifyRequestToken(event);
    const actor = resolveActorFromToken(decoded);

    if (!actor.userId) {
      return createResponse(401, { error: "Unauthorized" }, origin);
    }

    const { db } = await connectToDatabase();
    const otpRequests = db.collection(OTP_REQUESTS_COLLECTION);
    const otpGrants = db.collection(OTP_GRANTS_COLLECTION);
    const authenticatedUserProfile = await resolveAuthenticatedUserProfile(
      db,
      actor,
    );

    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters || {};
      const page = Math.max(parseInt(query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
      const skip = (page - 1) * limit;
      const globalSettings = await resolveGlobalBusinessSettings(db);
      const companyName = String(globalSettings?.companyName || "").trim();
      const activeCardFilter = String(query.filter || "total").trim();
      const baseQuery = buildFilterQueryFromParams(query);
      const listQuery = withCardFilter(baseQuery, activeCardFilter);
      const sortSpec = buildSortSpec(query);

      const [rows, totalRecords, statisticsAgg, filterRows] = await Promise.all(
        [
          otpRequests
            .find(listQuery)
            .sort(sortSpec)
            .skip(skip)
            .limit(limit)
            .toArray(),
          otpRequests.countDocuments(listQuery),
          otpRequests
            .aggregate([
              { $match: baseQuery },
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                },
              },
            ])
            .toArray(),
          otpRequests
            .find(baseQuery, {
              projection: {
                status: 1,
                operation: 1,
                credentialType: 1,
                requestedByName: 1,
                clientName: 1,
                clientBusinessName: 1,
                projectName: 1,
                recipients: 1,
              },
            })
            .limit(3000)
            .toArray(),
        ],
      );

      const statusCountMap = statisticsAgg.reduce((acc, item) => {
        const key = String(item?._id || "").trim();
        if (!key) return acc;
        acc[key] = Number(item?.count || 0);
        return acc;
      }, {});

      const statistics = {
        total: filterRows.length,
        otpSent: Number(statusCountMap.otp_sent || 0),
        verified: Number(statusCountMap.verified || 0),
        expired: Number(statusCountMap.expired || 0),
        blocked: Number(statusCountMap.blocked_wrong_attempts || 0),
        resendLocked: Number(statusCountMap.resend_locked || 0),
      };

      const filterOptions = {
        status: [
          "All",
          ...uniqSorted(
            filterRows.map((row) => formatStatusLabel(row?.status)),
          ).filter((item) => item !== "All"),
        ],
        operation: [
          "All",
          ...uniqSorted(filterRows.map((row) => row?.operation)).filter(
            (item) => item !== "All",
          ),
        ],
        credentialType: [
          "All",
          ...uniqSorted(
            filterRows.map((row) =>
              formatCredentialTypeLabel(row?.credentialType),
            ),
          ).filter((item) => item !== "All"),
        ],
        requestBy: [
          "All",
          ...uniqSorted(filterRows.map((row) => row?.requestedByName)).filter(
            (item) => item !== "All",
          ),
        ],
        clientName: [
          "All",
          ...uniqSorted(filterRows.map((row) => row?.clientName)).filter(
            (item) => item !== "All",
          ),
        ],
        clientBusinessName: [
          "All",
          ...uniqSorted(
            filterRows.map((row) => row?.clientBusinessName),
          ).filter((item) => item !== "All"),
        ],
        projectName: [
          "All",
          ...uniqSorted(filterRows.map((row) => row?.projectName)).filter(
            (item) => item !== "All",
          ),
        ],
        sentTo: [
          "All",
          ...uniqSorted(
            filterRows.map((row) => buildSentToLabel(row?.recipients)),
          ).filter((item) => item !== "All"),
        ],
      };

      return createResponse(
        200,
        {
          data: rows.map((row) =>
            shapeRequestRow({
              ...row,
              __settings: {
                companyName,
              },
            }),
          ),
          statistics,
          filterOptions,
          pagination: {
            currentPage: page,
            recordsPerPage: limit,
            totalRecords,
            totalPages: Math.max(Math.ceil(totalRecords / limit), 1),
          },
        },
        origin,
      );
    }

    if (event.httpMethod !== "POST") {
      return createResponse(405, { error: "Method not allowed" }, origin);
    }

    const payload = event.body ? JSON.parse(event.body) : {};
    const action = String(payload.action || "send")
      .trim()
      .toLowerCase();

    if (!["send", "resend", "verify"].includes(action)) {
      return createResponse(400, { error: "Invalid action" }, origin);
    }

    if (action === "verify") {
      const requestId = String(payload.requestId || "").trim();
      const otp = String(payload.otp || "")
        .replace(/\D+/g, "")
        .slice(0, OTP_DIGITS);

      if (!requestId || !ObjectId.isValid(requestId)) {
        return createResponse(
          400,
          { error: "Valid requestId is required" },
          origin,
        );
      }

      if (otp.length !== OTP_DIGITS) {
        return createResponse(
          400,
          { error: "Enter a valid 6 digit OTP" },
          origin,
        );
      }

      const now = new Date();
      const requestDoc = await otpRequests.findOne({
        _id: new ObjectId(requestId),
      });

      if (!requestDoc) {
        return createResponse(404, { error: "OTP request not found" }, origin);
      }

      if (String(requestDoc.requestedById || "") !== actor.userId) {
        return createResponse(
          403,
          { error: "You are not allowed to verify this OTP" },
          origin,
        );
      }

      if (
        requestDoc.resendLockedUntil &&
        new Date(requestDoc.resendLockedUntil) > now
      ) {
        return createResponse(
          429,
          {
            error: "OTP resend limit reached. Try again after lock period.",
            resendLockedUntil: toIso(requestDoc.resendLockedUntil),
          },
          origin,
        );
      }

      if (requestDoc.blockedUntil && new Date(requestDoc.blockedUntil) > now) {
        return createResponse(
          429,
          {
            error: "Too many wrong OTP attempts. Please wait before retry.",
            blockedUntil: toIso(requestDoc.blockedUntil),
          },
          origin,
        );
      }

      if (!requestDoc.otpExpiresAt || new Date(requestDoc.otpExpiresAt) < now) {
        await otpRequests.updateOne(
          { _id: requestDoc._id },
          {
            $set: {
              status: "expired",
              updatedAt: now,
            },
          },
        );

        return createResponse(
          400,
          {
            error: "OTP expired. Please resend OTP.",
          },
          origin,
        );
      }

      if (
        requestDoc.otpVerifyWindowUntil &&
        new Date(requestDoc.otpVerifyWindowUntil) < now
      ) {
        return createResponse(
          400,
          {
            error: "OTP verification window expired. Please resend OTP.",
            code: "OTP_REQUIRES_RESEND_AFTER_1_MIN",
          },
          origin,
        );
      }

      const actualHash = buildOtpHash(otp, String(requestDoc.otpSalt || ""));
      const expectedHash = String(requestDoc.otpHash || "");

      if (!expectedHash || actualHash !== expectedHash) {
        const wrongAttemptCount = Number(requestDoc.wrongAttemptCount || 0) + 1;
        const setData = {
          wrongAttemptCount,
          updatedAt: now,
          status: "otp_sent",
        };

        if (wrongAttemptCount >= MAX_WRONG_ATTEMPTS) {
          setData.blockedUntil = new Date(
            now.getTime() + WRONG_ATTEMPT_BLOCK_MS,
          );
          setData.status = "blocked_wrong_attempts";
        }

        await otpRequests.updateOne(
          { _id: requestDoc._id },
          {
            $set: setData,
            $push: {
              attempts: {
                at: now,
                type: "verify-failed",
                message: "Wrong OTP entered",
              },
            },
          },
        );

        return createResponse(
          400,
          {
            error:
              wrongAttemptCount >= MAX_WRONG_ATTEMPTS
                ? "Too many wrong OTP attempts. Access blocked for 15 minutes."
                : "Incorrect OTP",
            wrongAttemptCount,
            blockedUntil: toIso(setData.blockedUntil),
          },
          origin,
        );
      }

      const grantToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(now.getTime() + ACCESS_GRANT_MS);

      await otpGrants.insertOne({
        token: grantToken,
        requestId: requestDoc._id,
        requestedById: requestDoc.requestedById,
        requestedByName: requestDoc.requestedByName,
        requestedByRole: requestDoc.requestedByRole,
        operation: requestDoc.operation,
        credentialType: requestDoc.credentialType,
        credentialId: requestDoc.credentialId,
        purpose: requestDoc.purpose,
        recipients: requestDoc.recipients || [],
        createdAt: now,
        updatedAt: now,
        expiresAt,
        isRevoked: false,
      });

      await otpRequests.updateOne(
        { _id: requestDoc._id },
        {
          $set: {
            status: "verified",
            verifiedAt: now,
            wrongAttemptCount: 0,
            blockedUntil: null,
            grantExpiresAt: expiresAt,
            updatedAt: now,
          },
          $push: {
            attempts: {
              at: now,
              type: "verify-success",
              message: "OTP verified successfully",
            },
          },
        },
      );

      return createResponse(
        200,
        {
          success: true,
          message: "OTP verified successfully",
          accessToken: grantToken,
          operation: requestDoc.operation,
          credentialType: requestDoc.credentialType,
          credentialId: requestDoc.credentialId,
          validUntil: toIso(expiresAt),
        },
        origin,
      );
    }

    const requestId = String(payload.requestId || "").trim();

    let requestDoc = null;
    if (action === "resend") {
      if (!requestId || !ObjectId.isValid(requestId)) {
        return createResponse(
          400,
          { error: "Valid requestId is required" },
          origin,
        );
      }

      requestDoc = await otpRequests.findOne({ _id: new ObjectId(requestId) });
      if (!requestDoc) {
        return createResponse(404, { error: "OTP request not found" }, origin);
      }

      if (String(requestDoc.requestedById || "") !== actor.userId) {
        return createResponse(
          403,
          { error: "You are not allowed to resend this OTP" },
          origin,
        );
      }
    }

    const now = new Date();
    const waConfig = await getWhatsAppConfig(db);

    if (!waConfig.accessToken || !waConfig.phoneNumberId) {
      return createResponse(
        400,
        {
          error:
            "WhatsApp Cloud API is not configured. Please complete settings first.",
        },
        origin,
      );
    }

    let resolvedRequest = requestDoc;
    if (action === "send") {
      const operation = String(payload.operation || "")
        .trim()
        .toLowerCase();
      const credentialType = String(payload.credentialType || "")
        .trim()
        .toLowerCase();
      const credentialId = String(payload.credentialId || "").trim();
      const purpose = String(payload.purpose || "").trim();
      const recipientMode = String(payload.recipientMode || "")
        .trim()
        .toLowerCase();

      if (!["view", "edit"].includes(operation)) {
        return createResponse(
          400,
          { error: "operation must be view or edit" },
          origin,
        );
      }

      if (
        !["project-credentials", "my-software-credential"].includes(
          credentialType,
        )
      ) {
        return createResponse(400, { error: "Invalid credentialType" }, origin);
      }

      if (!credentialId) {
        return createResponse(
          400,
          { error: "credentialId is required" },
          origin,
        );
      }

      if (!purpose) {
        return createResponse(400, { error: "Purpose is required" }, origin);
      }

      if (!["founder", "client", "both"].includes(recipientMode)) {
        return createResponse(400, { error: "Invalid recipient mode" }, origin);
      }

      const latest = await otpRequests.findOne(
        {
          requestedById: actor.userId,
          credentialType,
          credentialId,
          operation,
        },
        { sort: { createdAt: -1, _id: -1 } },
      );

      if (
        latest?.resendLockedUntil &&
        new Date(latest.resendLockedUntil) > now
      ) {
        return createResponse(
          429,
          {
            error: "Send limit reached. Please wait 30 minutes.",
            resendLockedUntil: toIso(latest.resendLockedUntil),
          },
          origin,
        );
      }

      const selectedClientId = String(
        payload.selectedClientId || payload.clientRefId || "",
      ).trim();
      const selectedClient = await resolveClientByIdOrRef(db, selectedClientId);

      const inlineClientFallback = {
        clientName: String(payload.clientName || "").trim(),
        businessName: String(
          payload.clientBusinessName || payload.businessName || "",
        ).trim(),
        phoneNumber: String(payload.clientPhoneNumber || "").trim(),
      };

      const resolvedClient = selectedClient || inlineClientFallback;
      const recipients = collectRecipients({
        recipientMode,
        founderPhone: waConfig.founderCeoPhoneNumber,
        clientRecord: resolvedClient,
      });

      const otp = generateOtp();
      const otpSalt = crypto.randomBytes(8).toString("hex");
      const otpHash = buildOtpHash(otp, otpSalt);

      const resolvedSenderName = resolvePreferredSenderName({
        payloadSenderName: String(payload.senderName || "").trim(),
        profileName: authenticatedUserProfile.name,
        actorName: actor.name,
      });
      const resolvedSenderPhone = String(
        payload.senderPhoneNumber || authenticatedUserProfile.phone || "",
      )
        .replace(/\D+/g, "")
        .slice(-10);

      const insertDoc = {
        requestedById: actor.userId,
        requestedByName: formatPersonDisplayName(
          resolvedSenderName,
          resolvedSenderPhone,
        ),
        requestedByRole: normalizeRole(actor.role),
        requestedPhoneNumber: resolvedSenderPhone,
        requestedAt: now,
        credentialType,
        credentialId,
        operation,
        purpose,
        recipientMode,
        recipients,
        clientRefId: String(
          selectedClient?._id ||
            selectedClient?.clientId ||
            payload.clientRefId ||
            "",
        ),
        clientName:
          credentialType === "my-software-credential"
            ? resolvedSenderName || "Client"
            : String(
                resolvedClient?.clientName || payload.clientName || "",
              ).trim() || "Client",
        clientBusinessName: String(
          credentialType === "my-software-credential"
            ? waConfig.companyName ||
                payload.clientBusinessName ||
                payload.businessName ||
                ""
            : resolvedClient?.businessName ||
                payload.clientBusinessName ||
                payload.businessName ||
                "",
        ).trim(),
        projectName: String(payload.projectName || "").trim(),
        otpHash,
        otpSalt,
        sendCount: 1,
        wrongAttemptCount: 0,
        blockedUntil: null,
        otpSentAt: now,
        otpExpiresAt: new Date(now.getTime() + OTP_EXPIRES_MS),
        otpVerifyWindowUntil: new Date(now.getTime() + OTP_VERIFY_WINDOW_MS),
        resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
        resendLockedUntil: null,
        status: "otp_sent",
        attempts: [
          {
            at: now,
            type: "send",
            message: "OTP sent",
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      const inserted = await otpRequests.insertOne(insertDoc);
      resolvedRequest = {
        ...insertDoc,
        _id: inserted.insertedId,
      };

      const senderPhoneNumber = String(resolvedSenderPhone || "").trim();
      const variables = buildTemplateVariables({
        clientName: resolvedRequest.clientName,
        senderName: resolvedSenderName,
        senderPhoneNumber,
        purpose,
        otp,
      });

      const dispatchResults = [];
      for (const recipient of recipients) {
        try {
          const response = await sendTemplateMessage({
            accessToken: waConfig.accessToken,
            phoneNumberId: waConfig.phoneNumberId,
            to: recipient.phone,
            variables,
          });

          dispatchResults.push({
            ...recipient,
            success: true,
            providerResponse: response,
          });
        } catch (error) {
          dispatchResults.push({
            ...recipient,
            success: false,
            error: error?.message || "Send failed",
          });
        }
      }

      const allSent = dispatchResults.every((item) => item.success === true);
      if (!allSent) {
        await otpRequests.updateOne(
          { _id: resolvedRequest._id },
          {
            $set: {
              status: "send_failed",
              updatedAt: new Date(),
            },
            $push: {
              attempts: {
                at: new Date(),
                type: "send-failed",
                message: "One or more recipients failed",
                dispatchResults,
              },
            },
          },
        );

        return createResponse(
          502,
          {
            error: "OTP could not be delivered to all selected recipients",
            dispatchResults,
            requestId: String(resolvedRequest._id),
          },
          origin,
        );
      }

      return createResponse(
        200,
        {
          success: true,
          message: "OTP sent successfully",
          requestId: String(resolvedRequest._id),
          resendAvailableAt: toIso(resolvedRequest.resendAvailableAt),
          otpExpiresAt: toIso(resolvedRequest.otpExpiresAt),
          verifyWindowUntil: toIso(resolvedRequest.otpVerifyWindowUntil),
          sendCount: resolvedRequest.sendCount,
          maxSends: MAX_TOTAL_SENDS,
        },
        origin,
      );
    }

    if (!resolvedRequest) {
      return createResponse(404, { error: "OTP request not found" }, origin);
    }

    if (
      resolvedRequest.resendLockedUntil &&
      new Date(resolvedRequest.resendLockedUntil) > now
    ) {
      return createResponse(
        429,
        {
          error: "Send limit reached. Please wait 30 minutes.",
          resendLockedUntil: toIso(resolvedRequest.resendLockedUntil),
        },
        origin,
      );
    }

    if (
      resolvedRequest.resendAvailableAt &&
      new Date(resolvedRequest.resendAvailableAt) > now
    ) {
      return createResponse(
        429,
        {
          error: "Resend will be available after cooldown",
          resendAvailableAt: toIso(resolvedRequest.resendAvailableAt),
        },
        origin,
      );
    }

    const currentCount = Number(resolvedRequest.sendCount || 1);
    if (currentCount >= MAX_TOTAL_SENDS) {
      const resendLockedUntil = new Date(now.getTime() + RESEND_LOCK_MS);
      await otpRequests.updateOne(
        { _id: resolvedRequest._id },
        {
          $set: {
            resendLockedUntil,
            status: "resend_locked",
            updatedAt: now,
          },
          $push: {
            attempts: {
              at: now,
              type: "resend-blocked",
              message: "Exceeded max resend count",
            },
          },
        },
      );

      return createResponse(
        429,
        {
          error: "Maximum resend limit reached. Try again after 30 minutes.",
          resendLockedUntil: toIso(resendLockedUntil),
          sendCount: currentCount,
          maxSends: MAX_TOTAL_SENDS,
        },
        origin,
      );
    }

    const otp = generateOtp();
    const otpSalt = crypto.randomBytes(8).toString("hex");
    const otpHash = buildOtpHash(otp, otpSalt);

    const recipients = Array.isArray(resolvedRequest.recipients)
      ? resolvedRequest.recipients
      : [];

    const senderPhoneNumber = String(
      resolvedRequest?.requestedPhoneNumber || "",
    ).trim();
    const variables = buildTemplateVariables({
      clientName: resolvedRequest.clientName,
      senderName: resolvedRequest.requestedByName || actor.name,
      senderPhoneNumber,
      purpose: resolvedRequest.purpose,
      otp,
    });

    const dispatchResults = [];
    for (const recipient of recipients) {
      try {
        const response = await sendTemplateMessage({
          accessToken: waConfig.accessToken,
          phoneNumberId: waConfig.phoneNumberId,
          to: recipient.phone,
          variables,
        });

        dispatchResults.push({
          ...recipient,
          success: true,
          providerResponse: response,
        });
      } catch (error) {
        dispatchResults.push({
          ...recipient,
          success: false,
          error: error?.message || "Send failed",
        });
      }
    }

    const allSent = dispatchResults.every((item) => item.success === true);
    const nextSendCount = currentCount + 1;

    const updateSet = {
      otpHash,
      otpSalt,
      sendCount: nextSendCount,
      otpSentAt: now,
      otpExpiresAt: new Date(now.getTime() + OTP_EXPIRES_MS),
      otpVerifyWindowUntil: new Date(now.getTime() + OTP_VERIFY_WINDOW_MS),
      resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      updatedAt: now,
      status: allSent ? "otp_sent" : "send_failed",
    };

    await otpRequests.updateOne(
      { _id: resolvedRequest._id },
      {
        $set: updateSet,
        $push: {
          attempts: {
            at: now,
            type: allSent ? "resend" : "resend-failed",
            message: allSent
              ? "OTP resent"
              : "OTP resend failed for one or more recipients",
            dispatchResults,
          },
        },
      },
    );

    if (!allSent) {
      return createResponse(
        502,
        {
          error: "OTP could not be resent to all selected recipients",
          dispatchResults,
          requestId: String(resolvedRequest._id),
          sendCount: nextSendCount,
          maxSends: MAX_TOTAL_SENDS,
        },
        origin,
      );
    }

    return createResponse(
      200,
      {
        success: true,
        message: "OTP resent successfully",
        requestId: String(resolvedRequest._id),
        resendAvailableAt: toIso(updateSet.resendAvailableAt),
        otpExpiresAt: toIso(updateSet.otpExpiresAt),
        verifyWindowUntil: toIso(updateSet.otpVerifyWindowUntil),
        sendCount: nextSendCount,
        maxSends: MAX_TOTAL_SENDS,
      },
      origin,
    );
  } catch (error) {
    console.error("OTP access API error:", error);

    if (
      String(error?.message || "")
        .toLowerCase()
        .includes("token")
    ) {
      return createResponse(401, { error: "Unauthorized" }, origin);
    }

    return createResponse(
      500,
      {
        error: "Internal server error",
        message: error?.message || "Unknown error",
      },
      origin,
    );
  }
}
