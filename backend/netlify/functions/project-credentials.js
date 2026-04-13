import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import crypto from "crypto";

const SECRET_MASK = "********";
const ENCRYPTED_PREFIX = "enc:v1:";
const SENSITIVE_FIELDS = [
  "serverRootUsername",
  "serverRootPassword",
  "databaseRootUsername",
  "databaseRootPassword",
  "appUsername",
  "appPassword",
];
const LEGACY_SENSITIVE_ALIASES = {
  serverRootUsername: ["serverRootUsername", "serverUsername"],
  serverRootPassword: ["serverRootPassword", "serverPassword"],
  databaseRootUsername: ["databaseRootUsername", "databaseId"],
  databaseRootPassword: ["databaseRootPassword", "databasePassword"],
  appUsername: ["appUsername"],
  appPassword: ["appPassword"],
};
const SECRET_CUSTOM_FIELD_TYPES = [
  "password",
  "env-variable",
  "api-key",
  "client-id",
  "client-secret",
  "refresh-token",
  "access-token",
  "secret",
  "bearer-token",
  "user-id",
];

let cachedEncryptionKey = null;

const isMaskedSecretValue = (value = "") =>
  String(value || "").trim() === SECRET_MASK;

const maskSecretValue = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return SECRET_MASK;
};

const isSecretCustomFieldType = (type = "") =>
  SECRET_CUSTOM_FIELD_TYPES.includes(
    String(type || "")
      .trim()
      .toLowerCase(),
  );

const getEncryptionKey = () => {
  if (cachedEncryptionKey) return cachedEncryptionKey;

  const raw = String(process.env.CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is missing. Set a strong 128-char hex key for project credential encryption.",
    );
  }

  if (!/^[a-fA-F0-9]{128}$/.test(raw)) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY must be exactly 128 hex characters.",
    );
  }

  const keyMaterial = Buffer.from(raw, "hex");
  const keyBuffer = crypto.createHash("sha256").update(keyMaterial).digest();

  cachedEncryptionKey = keyBuffer;
  return cachedEncryptionKey;
};

const encryptSecretValue = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith(ENCRYPTED_PREFIX)) return normalized;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

const decryptSecretValue = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!normalized.startsWith(ENCRYPTED_PREFIX)) return normalized;

  const payload = normalized.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret format");
  }

  const [ivBase64, tagBase64, encryptedBase64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8").trim();
};

const applySecretProtection = (nextPayload, existingRecord = null) => {
  const protectedPayload = { ...nextPayload };

  SENSITIVE_FIELDS.forEach((field) => {
    const incomingValue = String(nextPayload?.[field] || "").trim();
    const aliases = LEGACY_SENSITIVE_ALIASES[field] || [field];
    const existingValue = String(
      aliases
        .map((key) => existingRecord?.[key])
        .find((value) => String(value || "").trim()) || "",
    ).trim();

    if (isMaskedSecretValue(incomingValue)) {
      protectedPayload[field] = existingValue;
      return;
    }

    if (!incomingValue) {
      protectedPayload[field] = "";
      return;
    }

    protectedPayload[field] = encryptSecretValue(incomingValue);
  });

  const previousCustomFields = Array.isArray(existingRecord?.customFields)
    ? existingRecord.customFields
    : [];

  const resolvePreviousCustomField = (field, index) => {
    const fieldId = String(field?.id || "").trim();
    if (fieldId) {
      const byId = previousCustomFields.find(
        (candidate) => String(candidate?.id || "").trim() === fieldId,
      );
      if (byId) return byId;
    }

    const fieldName = String(field?.name || "")
      .trim()
      .toLowerCase();
    const fieldType = String(field?.type || "")
      .trim()
      .toLowerCase();

    const byNameAndType = previousCustomFields.find((candidate) => {
      const candidateName = String(candidate?.name || "")
        .trim()
        .toLowerCase();
      const candidateType = String(candidate?.type || "")
        .trim()
        .toLowerCase();
      return (
        Boolean(fieldName) &&
        Boolean(fieldType) &&
        candidateName === fieldName &&
        candidateType === fieldType
      );
    });

    if (byNameAndType) return byNameAndType;

    return previousCustomFields[index] || null;
  };

  protectedPayload.customFields = Array.isArray(nextPayload?.customFields)
    ? nextPayload.customFields.map((field, index) => {
        if (!isSecretCustomFieldType(field?.type)) {
          return field;
        }

        const incomingValue = String(field?.value || "").trim();
        const previousField = resolvePreviousCustomField(field, index);
        const existingValue = String(previousField?.value || "").trim();

        if (isMaskedSecretValue(incomingValue)) {
          return { ...field, value: existingValue };
        }

        if (!incomingValue) {
          return { ...field, value: "" };
        }

        return {
          ...field,
          value: encryptSecretValue(incomingValue),
        };
      })
    : [];

  return protectedPayload;
};

const sanitizeRecordForResponse = (record) => {
  if (!record || typeof record !== "object") return record;

  const sanitized = {
    ...record,
    serverRootUsername:
      record.serverRootUsername || String(record.serverUsername || "").trim(),
    serverRootPassword:
      record.serverRootPassword || String(record.serverPassword || "").trim(),
    databaseRootUsername:
      record.databaseRootUsername || String(record.databaseId || "").trim(),
    databaseRootPassword:
      record.databaseRootPassword ||
      String(record.databasePassword || "").trim(),
  };

  delete sanitized.serverUsername;
  delete sanitized.serverPassword;
  delete sanitized.databaseId;
  delete sanitized.databasePassword;

  SENSITIVE_FIELDS.forEach((field) => {
    sanitized[field] = maskSecretValue(sanitized[field]);
  });

  sanitized.customFields = Array.isArray(record.customFields)
    ? record.customFields.map((field) => {
        if (!isSecretCustomFieldType(field?.type)) {
          return field;
        }

        return {
          ...field,
          value: maskSecretValue(field?.value),
        };
      })
    : [];

  return sanitized;
};

const revealSecretValueFromRecord = ({ record, field, customFieldId }) => {
  const normalizedField = String(field || "").trim();

  if (SENSITIVE_FIELDS.includes(normalizedField)) {
    const aliases = LEGACY_SENSITIVE_ALIASES[normalizedField] || [
      normalizedField,
    ];
    const rawValue = aliases
      .map((key) => record?.[key])
      .find((value) => String(value || "").trim());

    return {
      key: normalizedField,
      value: decryptSecretValue(rawValue || ""),
    };
  }

  const normalizedCustomFieldId = String(customFieldId || "").trim();
  if (!normalizedCustomFieldId) {
    throw new Error("customFieldId is required for custom field reveal");
  }

  const customField = Array.isArray(record?.customFields)
    ? record.customFields.find(
        (item) => String(item?.id || "").trim() === normalizedCustomFieldId,
      )
    : null;

  if (!customField) {
    throw new Error("Custom field not found");
  }

  if (!isSecretCustomFieldType(customField.type)) {
    throw new Error("Selected custom field is not a secret field");
  }

  return {
    key: normalizedCustomFieldId,
    value: decryptSecretValue(customField.value || ""),
  };
};

const normalizeCustomFields = (fields = []) => {
  if (!Array.isArray(fields)) return [];

  return fields
    .map((field, index) => {
      const type =
        String(field?.type || "text")
          .trim()
          .toLowerCase() || "text";
      const options =
        type === "option" && Array.isArray(field?.options)
          ? field.options
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          : [];

      return {
        id:
          String(field?.id || "").trim() ||
          `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        name: String(field?.name || "").trim(),
        value: String(field?.value || "").trim(),
        required: field?.required === true,
        options,
      };
    })
    .filter((field) => field.name || field.value || field.options.length > 0);
};

const collectMaskedSecretFieldNames = (inputFields = [], outputFields = []) => {
  if (!Array.isArray(inputFields) || !Array.isArray(outputFields)) return [];

  return inputFields
    .map((field, index) => {
      const type = String(field?.type || "")
        .trim()
        .toLowerCase();

      if (!isSecretCustomFieldType(type)) return "";
      if (!isMaskedSecretValue(field?.value || "")) return "";

      const resolvedValue = String(outputFields[index]?.value || "").trim();
      if (resolvedValue) return "";

      return String(field?.name || `Custom Field ${index + 1}`).trim();
    })
    .filter(Boolean);
};

const resolveActorId = (decoded = {}) =>
  String(decoded?.userId || decoded?.id || decoded?._id || "").trim();

const validateOtpAccessGrant = async ({
  db,
  token,
  actorId,
  operation,
  credentialId,
}) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new Error("OTP access token is required");
  }

  const normalizedOperation = String(operation || "")
    .trim()
    .toLowerCase();
  if (!["view", "edit"].includes(normalizedOperation)) {
    throw new Error("Invalid operation in OTP access token check");
  }

  const grantsCollection = db.collection("otpAccessGrants");
  const grant = await grantsCollection.findOne({
    token: normalizedToken,
    isRevoked: { $ne: true },
    credentialType: "project-credentials",
    credentialId: String(credentialId || "").trim(),
    operation: normalizedOperation,
  });

  if (!grant) {
    throw new Error("OTP access token is invalid");
  }

  if (String(grant.requestedById || "") !== String(actorId || "")) {
    throw new Error("OTP access token does not belong to current user");
  }

  if (!grant.expiresAt || new Date(grant.expiresAt).getTime() < Date.now()) {
    throw new Error("OTP access token has expired");
  }

  await grantsCollection.updateOne(
    { _id: grant._id },
    {
      $set: {
        updatedAt: new Date(),
        lastUsedAt: new Date(),
      },
    },
  );
};

/**
 * Project Credentials API
 * Handles CRUD with pagination, filters, search and card statistics
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const decodedToken = verifyRequestToken(event);
    const actorId = resolveActorId(decodedToken);

    const { db } = await connectToDatabase();
    const collection = db.collection("projectCredentials");

    if (event.httpMethod === "GET") {
      const {
        action,
        id,
        page = 1,
        limit = 10,
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
      } = event.queryStringParameters || {};

      if (String(action || "").trim() === "reveal-secret") {
        const normalizedId = String(id || "").trim();
        const field = String(
          (event.queryStringParameters || {}).field || "",
        ).trim();
        const customFieldId = String(
          (event.queryStringParameters || {}).customFieldId || "",
        ).trim();
        const otpAccessToken = String(
          (event.queryStringParameters || {}).otpAccessToken || "",
        ).trim();
        const operation = String(
          (event.queryStringParameters || {}).operation || "view",
        )
          .trim()
          .toLowerCase();

        if (!normalizedId || !ObjectId.isValid(normalizedId)) {
          return createResponse(400, { error: "Valid ID is required" }, origin);
        }

        if (!field) {
          return createResponse(400, { error: "field is required" }, origin);
        }

        try {
          await validateOtpAccessGrant({
            db,
            token: otpAccessToken,
            actorId,
            operation,
            credentialId: normalizedId,
          });
        } catch (error) {
          return createResponse(
            403,
            { error: error?.message || "OTP access validation failed" },
            origin,
          );
        }

        const record = await collection.findOne({
          _id: new ObjectId(normalizedId),
          isDeleted: { $ne: true },
        });

        if (!record) {
          return createResponse(404, { error: "Record not found" }, origin);
        }

        try {
          const revealed = revealSecretValueFromRecord({
            record,
            field,
            customFieldId,
          });

          return createResponse(
            200,
            {
              success: true,
              field,
              key: revealed.key,
              value: revealed.value,
            },
            origin,
          );
        } catch (error) {
          return createResponse(
            400,
            { error: error?.message || "Unable to reveal secret" },
            origin,
          );
        }
      }

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid record ID" }, origin);
        }

        const record = await collection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!record) {
          return createResponse(404, { error: "Record not found" }, origin);
        }

        return createResponse(200, sanitizeRecordForResponse(record), origin);
      }

      const params = event.queryStringParameters || {};
      const filterQuery = { isDeleted: { $ne: true } };

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;

        if (
          [
            "id",
            "page",
            "limit",
            "search",
            "sortBy",
            "sortOrder",
            "filter",
          ].includes(key)
        )
          return;

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value
              .split(",")
              .map((row) => row.trim())
              .filter(Boolean),
          };
          return;
        }

        if (
          ["clientName", "projectName", "serverName", "databaseName"].includes(
            key,
          )
        ) {
          filterQuery[key] = value.trim();
          return;
        }

        filterQuery[key] = { $regex: String(value).trim(), $options: "i" };
      });

      if (filter) {
        switch (filter) {
          case "withWebsite":
            filterQuery.$or = [
              { websiteGithubRepoName: { $exists: true, $ne: "" } },
              { websiteGithubUrl: { $exists: true, $ne: "" } },
              { websiteLink: { $exists: true, $ne: "" } },
            ];
            break;
          case "withApp":
            filterQuery.$or = [
              { appGithubRepoName: { $exists: true, $ne: "" } },
              { appGithubUrl: { $exists: true, $ne: "" } },
              { androidAppLink: { $exists: true, $ne: "" } },
              { iosRepoName: { $exists: true, $ne: "" } },
              { iosRepoUrl: { $exists: true, $ne: "" } },
              { iosAppLink: { $exists: true, $ne: "" } },
            ];
            break;
          case "withServer":
            filterQuery.$or = [
              { serverName: { $exists: true, $ne: "" } },
              { serverPortNumber: { $exists: true, $ne: "" } },
              { serverRootUsername: { $exists: true, $ne: "" } },
              { serverRootPassword: { $exists: true, $ne: "" } },
              { serverUsername: { $exists: true, $ne: "" } },
              { serverPassword: { $exists: true, $ne: "" } },
            ];
            break;
          case "withDatabase":
            filterQuery.$or = [
              { databaseName: { $exists: true, $ne: "" } },
              { databasePortNumber: { $exists: true, $ne: "" } },
              { databaseRootUsername: { $exists: true, $ne: "" } },
              { databaseRootPassword: { $exists: true, $ne: "" } },
              { databaseId: { $exists: true, $ne: "" } },
              { databasePassword: { $exists: true, $ne: "" } },
            ];
            break;
          default:
            break;
        }
      }

      if (search) {
        filterQuery.$and = filterQuery.$and || [];
        filterQuery.$and.push({
          $or: [
            { clientName: { $regex: search, $options: "i" } },
            { businessName: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
            { websiteGithubRepoName: { $regex: search, $options: "i" } },
            { websiteGithubUrl: { $regex: search, $options: "i" } },
            { websiteLink: { $regex: search, $options: "i" } },
            { appGithubRepoName: { $regex: search, $options: "i" } },
            { appGithubUrl: { $regex: search, $options: "i" } },
            { androidAppLink: { $regex: search, $options: "i" } },
            { iosRepoName: { $regex: search, $options: "i" } },
            { iosRepoUrl: { $regex: search, $options: "i" } },
            { iosAppLink: { $regex: search, $options: "i" } },
            { serverName: { $regex: search, $options: "i" } },
            { serverPortNumber: { $regex: search, $options: "i" } },
            { serverRootUsername: { $regex: search, $options: "i" } },
            { serverUsername: { $regex: search, $options: "i" } },
            { databaseName: { $regex: search, $options: "i" } },
            { databasePortNumber: { $regex: search, $options: "i" } },
            { databaseRootUsername: { $regex: search, $options: "i" } },
            { databaseId: { $regex: search, $options: "i" } },
            { appUsername: { $regex: search, $options: "i" } },
          ],
        });
      }

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
      const skip = (pageNum - 1) * limitNum;

      const sortObject = {
        [sortBy]: sortOrder === "asc" ? 1 : -1,
      };

      const totalRecords = await collection.countDocuments(filterQuery);

      const data = await collection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const sanitizedData = data.map((item) => sanitizeRecordForResponse(item));

      const clientNameValues = await collection.distinct("clientName", {
        isDeleted: { $ne: true },
        clientName: { $exists: true, $ne: "" },
      });

      const total = await collection.countDocuments({
        isDeleted: { $ne: true },
      });
      const withWebsite = await collection.countDocuments({
        isDeleted: { $ne: true },
        $or: [
          { websiteGithubRepoName: { $exists: true, $ne: "" } },
          { websiteGithubUrl: { $exists: true, $ne: "" } },
          { websiteLink: { $exists: true, $ne: "" } },
        ],
      });
      const withApp = await collection.countDocuments({
        isDeleted: { $ne: true },
        $or: [
          { appGithubRepoName: { $exists: true, $ne: "" } },
          { appGithubUrl: { $exists: true, $ne: "" } },
          { androidAppLink: { $exists: true, $ne: "" } },
          { iosRepoName: { $exists: true, $ne: "" } },
          { iosRepoUrl: { $exists: true, $ne: "" } },
          { iosAppLink: { $exists: true, $ne: "" } },
        ],
      });
      const withServer = await collection.countDocuments({
        isDeleted: { $ne: true },
        $or: [
          { serverName: { $exists: true, $ne: "" } },
          { serverPortNumber: { $exists: true, $ne: "" } },
          { serverRootUsername: { $exists: true, $ne: "" } },
          { serverRootPassword: { $exists: true, $ne: "" } },
          { serverUsername: { $exists: true, $ne: "" } },
          { serverPassword: { $exists: true, $ne: "" } },
        ],
      });
      const withDatabase = await collection.countDocuments({
        isDeleted: { $ne: true },
        $or: [
          { databaseName: { $exists: true, $ne: "" } },
          { databasePortNumber: { $exists: true, $ne: "" } },
          { databaseRootUsername: { $exists: true, $ne: "" } },
          { databaseRootPassword: { $exists: true, $ne: "" } },
          { databaseId: { $exists: true, $ne: "" } },
          { databasePassword: { $exists: true, $ne: "" } },
        ],
      });

      return createResponse(
        200,
        {
          data: sanitizedData,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total,
            withWebsite,
            withApp,
            withServer,
            withDatabase,
          },
          filterOptions: {
            clientName: ["All", ...clientNameValues.sort()],
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");

      const normalizedPayload = {
        ...payload,
        clientRefId: String(payload.clientRefId || "").trim(),
        clientName: String(payload.clientName || "").trim(),
        businessName: String(payload.businessName || "").trim(),
        projectName: String(payload.projectName || "").trim(),
        websiteGithubRepoName: String(
          payload.websiteGithubRepoName || "",
        ).trim(),
        websiteGithubUrl: String(payload.websiteGithubUrl || "").trim(),
        websiteLink: String(payload.websiteLink || "").trim(),
        appGithubRepoName: String(payload.appGithubRepoName || "").trim(),
        appGithubUrl: String(payload.appGithubUrl || "").trim(),
        androidAppLink: String(payload.androidAppLink || "").trim(),
        iosRepoName: String(payload.iosRepoName || "").trim(),
        iosRepoUrl: String(payload.iosRepoUrl || "").trim(),
        iosAppLink: String(payload.iosAppLink || "").trim(),
        serverRootUsername: String(
          payload.serverRootUsername || payload.serverUsername || "",
        ).trim(),
        serverRootPassword: String(
          payload.serverRootPassword || payload.serverPassword || "",
        ).trim(),
        serverPortNumber: String(payload.serverPortNumber || "").trim(),
        databaseRootUsername: String(
          payload.databaseRootUsername || payload.databaseId || "",
        ).trim(),
        databaseRootPassword: String(
          payload.databaseRootPassword || payload.databasePassword || "",
        ).trim(),
        databasePortNumber: String(payload.databasePortNumber || "").trim(),
        customFields: normalizeCustomFields(payload.customFields),
      };

      delete normalizedPayload.serverUsername;
      delete normalizedPayload.serverPassword;
      delete normalizedPayload.databaseId;
      delete normalizedPayload.databasePassword;

      const securedPayload = applySecretProtection(normalizedPayload, null);
      const unresolvedMaskedSecrets = collectMaskedSecretFieldNames(
        normalizedPayload.customFields,
        securedPayload.customFields,
      );

      if (unresolvedMaskedSecrets.length > 0) {
        return createResponse(
          400,
          {
            error: `Please re-enter values for: ${unresolvedMaskedSecrets.join(", ")}`,
          },
          origin,
        );
      }

      if (!normalizedPayload.clientRefId) {
        return createResponse(
          400,
          { error: "Select Client is required" },
          origin,
        );
      }

      if (!normalizedPayload.clientName) {
        return createResponse(
          400,
          { error: "Client Name is required" },
          origin,
        );
      }

      if (!normalizedPayload.businessName) {
        return createResponse(
          400,
          { error: "Business Name is required" },
          origin,
        );
      }

      if (!normalizedPayload.projectName) {
        return createResponse(
          400,
          { error: "Project Name is required" },
          origin,
        );
      }

      const existingRecord = await collection.findOne({
        clientRefId: normalizedPayload.clientRefId,
        projectName: normalizedPayload.projectName,
        isDeleted: { $ne: true },
      });

      if (existingRecord) {
        return createResponse(
          409,
          {
            error:
              "Credentials for this client and project already exist. Please edit existing record.",
          },
          origin,
        );
      }

      const result = await collection.insertOne({
        ...securedPayload,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      });

      return createResponse(
        201,
        {
          message: "Project credentials created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(400, { error: "Valid ID is required" }, origin);
      }

      const payload = JSON.parse(event.body || "{}");

      const currentRecord = await collection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      if (!currentRecord) {
        return createResponse(404, { error: "Record not found" }, origin);
      }

      const normalizedPayload = {
        ...payload,
        clientRefId: String(payload.clientRefId || "").trim(),
        clientName: String(payload.clientName || "").trim(),
        businessName: String(payload.businessName || "").trim(),
        projectName: String(payload.projectName || "").trim(),
        websiteGithubRepoName: String(
          payload.websiteGithubRepoName || "",
        ).trim(),
        websiteGithubUrl: String(payload.websiteGithubUrl || "").trim(),
        websiteLink: String(payload.websiteLink || "").trim(),
        appGithubRepoName: String(payload.appGithubRepoName || "").trim(),
        appGithubUrl: String(payload.appGithubUrl || "").trim(),
        androidAppLink: String(payload.androidAppLink || "").trim(),
        iosRepoName: String(payload.iosRepoName || "").trim(),
        iosRepoUrl: String(payload.iosRepoUrl || "").trim(),
        iosAppLink: String(payload.iosAppLink || "").trim(),
        serverRootUsername: String(
          payload.serverRootUsername || payload.serverUsername || "",
        ).trim(),
        serverRootPassword: String(
          payload.serverRootPassword || payload.serverPassword || "",
        ).trim(),
        serverPortNumber: String(payload.serverPortNumber || "").trim(),
        databaseRootUsername: String(
          payload.databaseRootUsername || payload.databaseId || "",
        ).trim(),
        databaseRootPassword: String(
          payload.databaseRootPassword || payload.databasePassword || "",
        ).trim(),
        databasePortNumber: String(payload.databasePortNumber || "").trim(),
        customFields: normalizeCustomFields(payload.customFields),
      };

      delete normalizedPayload.serverUsername;
      delete normalizedPayload.serverPassword;
      delete normalizedPayload.databaseId;
      delete normalizedPayload.databasePassword;

      const securedPayload = applySecretProtection(
        normalizedPayload,
        currentRecord,
      );
      const unresolvedMaskedSecrets = collectMaskedSecretFieldNames(
        normalizedPayload.customFields,
        securedPayload.customFields,
      );

      if (unresolvedMaskedSecrets.length > 0) {
        return createResponse(
          400,
          {
            error: `Please re-enter values for: ${unresolvedMaskedSecrets.join(", ")}`,
          },
          origin,
        );
      }

      if (!normalizedPayload.clientRefId) {
        return createResponse(
          400,
          { error: "Select Client is required" },
          origin,
        );
      }

      if (!normalizedPayload.clientName) {
        return createResponse(
          400,
          { error: "Client Name is required" },
          origin,
        );
      }

      if (!normalizedPayload.businessName) {
        return createResponse(
          400,
          { error: "Business Name is required" },
          origin,
        );
      }

      if (!normalizedPayload.projectName) {
        return createResponse(
          400,
          { error: "Project Name is required" },
          origin,
        );
      }

      const duplicate = await collection.findOne({
        _id: { $ne: new ObjectId(id) },
        clientRefId: normalizedPayload.clientRefId,
        projectName: normalizedPayload.projectName,
        isDeleted: { $ne: true },
      });

      if (duplicate) {
        return createResponse(
          409,
          {
            error:
              "Credentials for this client and project already exist. Please use different project name.",
          },
          origin,
        );
      }

      const result = await collection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: {
            ...securedPayload,
            updatedAt: new Date(),
          },
          $unset: {
            serverUsername: "",
            serverPassword: "",
            databaseId: "",
            databasePassword: "",
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Record not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Project credentials updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(400, { error: "Valid ID is required" }, origin);
      }

      const result = await collection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Record not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Project credentials deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Project Credentials API Error:", error);

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(401, { error: "Unauthorized" }, origin);
    }

    if (error.name === "SyntaxError") {
      return createResponse(
        400,
        { error: "Invalid JSON in request body" },
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
