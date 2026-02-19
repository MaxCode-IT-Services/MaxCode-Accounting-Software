import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { ObjectId } from "mongodb";

const SETTINGS_COLLECTION = "business_settings";

const IMAGE_FIELDS = [
  "profilePhotoUrl",
  "logoUrl",
  "qrCodeUrl",
  "sealUrl",
  "paidSealUrl",
  "unpaidSealUrl",
];

const FIELD_TO_INDEX = IMAGE_FIELDS.reduce((acc, field, index) => {
  acc[field] = String(index);
  return acc;
}, {});

const INDEX_TO_FIELD = Object.entries(FIELD_TO_INDEX).reduce(
  (acc, [field, index]) => {
    acc[index] = field;
    return acc;
  },
  {},
);

const ALLOWED_FIELDS = [
  ...IMAGE_FIELDS,
  "companyName",
  "gstin",
  "companyAddress",
  "companyPhone",
  "companyEmail",
  "bankName",
  "ifscCode",
  "accountNumber",
  "accountName",
  "branchAddress",
  "invoiceTermsConditions",
  "selfInvoiceTermsConditions",
  "services",
];

const getBaseUrl = (event) => {
  const host =
    event.headers["x-forwarded-host"] || event.headers.host || "localhost:8888";

  const forwardedProto = event.headers["x-forwarded-proto"];
  const isLocalHost = host.includes("localhost") || host.includes("127.0.0.1");

  const protocol = forwardedProto || (isLocalHost ? "http" : "https");
  return `${protocol}://${host}`;
};

const normalizeHttpsUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  if (value.startsWith("https://")) return value;
  if (value.startsWith("http://")) {
    return value.replace("http://", "https://");
  }
  return value;
};

const isManagedBusinessAssetUrl = (value) =>
  typeof value === "string" &&
  value.includes("/api/business-settings") &&
  !value.startsWith("data:image/");

const sanitizeSettingsPayload = (payload = {}) => {
  const normalizedPayload = { ...payload };

  if (
    !Object.prototype.hasOwnProperty.call(normalizedPayload, "gstin") &&
    typeof normalizedPayload.GSTIN === "string"
  ) {
    normalizedPayload.gstin = normalizedPayload.GSTIN;
  }

  if (
    !Object.prototype.hasOwnProperty.call(normalizedPayload, "gstin") &&
    typeof normalizedPayload.companyGstin === "string"
  ) {
    normalizedPayload.gstin = normalizedPayload.companyGstin;
  }

  const sanitized = {};

  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(normalizedPayload, field)) {
      const value = normalizedPayload[field];
      if (typeof value === "string") {
        const trimmedValue = value.trim();

        if (IMAGE_FIELDS.includes(field)) {
          if (trimmedValue.startsWith("data:image/")) {
            sanitized[field] = trimmedValue;
          } else if (isManagedBusinessAssetUrl(trimmedValue)) {
            continue;
          } else {
            sanitized[field] = normalizeHttpsUrl(trimmedValue);
          }
        } else {
          sanitized[field] = trimmedValue;
        }
      } else if (field === "services" && Array.isArray(value)) {
        sanitized[field] = value
          .map((item) => ({
            id: item?.id ? String(item.id) : Date.now().toString(),
            name: item?.name ? String(item.name).trim() : "",
            hsnCode: item?.hsnCode ? String(item.hsnCode).trim() : "",
            status: item?.status === "inactive" ? "inactive" : "active",
          }))
          .filter((item) => item.name && item.hsnCode);
      } else {
        sanitized[field] = value;
      }
    }
  }

  return sanitized;
};

const mapSettingsForClient = (document, event) => {
  if (!document) return null;

  const response = {};

  for (const field of ALLOWED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(document, field)) continue;

    const value = document[field];

    if (!IMAGE_FIELDS.includes(field)) {
      response[field] = value;
      continue;
    }

    if (!value || typeof value !== "string") {
      response[field] = "";
      continue;
    }

    const settingsId = document?._id?.toString();
    const version = document?.updatedAt
      ? new Date(document.updatedAt).getTime()
      : document?.createdAt
        ? new Date(document.createdAt).getTime()
        : Date.now();
    const shortAssetUrl = settingsId
      ? `${getBaseUrl(event)}/api/business-settings?id=${buildAssetRef(settingsId, field)}&v=${version}`
      : "";

    if (value.startsWith("data:image/") || isManagedBusinessAssetUrl(value)) {
      response[field] = shortAssetUrl;
      continue;
    }

    response[field] = normalizeHttpsUrl(value);
  }

  if (
    !Object.prototype.hasOwnProperty.call(response, "gstin") &&
    typeof document.GSTIN === "string"
  ) {
    response.gstin = document.GSTIN;
  }

  if (
    !Object.prototype.hasOwnProperty.call(response, "gstin") &&
    typeof document.companyGstin === "string"
  ) {
    response.gstin = document.companyGstin;
  }

  return response;
};

const parseDataUrl = (dataUrl) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    data: match[2],
  };
};

const buildAssetRef = (settingsId, field) =>
  `${settingsId}.${FIELD_TO_INDEX[field]}`;

const parseAssetRef = (assetRef) => {
  if (!assetRef || typeof assetRef !== "string") return null;

  const [settingsId, fieldIndex] = assetRef.split(".");
  if (!settingsId || !fieldIndex) return null;

  const field = INDEX_TO_FIELD[fieldIndex];
  if (!field) return null;

  return { assetId: settingsId, field };
};

const parseManagedAssetUrl = (assetUrl) => {
  if (!assetUrl || typeof assetUrl !== "string") return null;

  try {
    const url = new URL(assetUrl);
    const idQuery = url.searchParams.get("id");

    if (idQuery) {
      const fromIdQuery = parseAssetRef(idQuery);
      if (fromIdQuery) return fromIdQuery;
    }

    const pathMatch = url.pathname.match(
      /\/business-settings\/asset\/([^/]+)\/([^/?]+)/,
    );

    if (pathMatch) {
      return {
        assetId: decodeURIComponent(pathMatch[1]),
        field: decodeURIComponent(pathMatch[2]),
      };
    }
  } catch {
    return null;
  }

  return null;
};

const getAssetParams = (event) => {
  const query = event.queryStringParameters || {};

  if (query.id) {
    const parsed = parseAssetRef(query.id);
    if (parsed) {
      return parsed;
    }
  }

  if (query.assetId && query.field) {
    return {
      assetId: query.assetId,
      field: query.field,
    };
  }

  const path = event.path || "";
  const pathMatch = path.match(/\/business-settings\/asset\/([^/]+)\/([^/?]+)/);

  if (!pathMatch) {
    return { assetId: null, field: null };
  }

  return {
    assetId: decodeURIComponent(pathMatch[1]),
    field: decodeURIComponent(pathMatch[2]),
  };
};

async function handleAssetRequest(event, origin) {
  const { assetId, field } = getAssetParams(event);

  if (!assetId || !field || !IMAGE_FIELDS.includes(field)) {
    return createResponse(
      400,
      { error: "assetId and field are required" },
      origin,
    );
  }

  let settingsId;
  try {
    settingsId = new ObjectId(assetId);
  } catch {
    return createResponse(400, { error: "Invalid assetId" }, origin);
  }

  const { db } = await connectToDatabase();
  const settingsCollection = db.collection(SETTINGS_COLLECTION);

  const settings = await settingsCollection.findOne({ _id: settingsId });
  const assetValue = settings?.[field];

  if (!assetValue) {
    return createResponse(404, { error: "Asset not found" }, origin);
  }

  if (typeof assetValue === "string" && assetValue.startsWith("data:image/")) {
    const parsed = parseDataUrl(assetValue);

    if (!parsed) {
      return createResponse(400, { error: "Invalid image data" }, origin);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": parsed.mimeType,
        "Cache-Control": "public, max-age=60",
      },
      isBase64Encoded: true,
      body: parsed.data,
    };
  }

  if (isManagedBusinessAssetUrl(assetValue)) {
    const currentRef = `${assetId}.${FIELD_TO_INDEX[field]}`;
    const nested = parseManagedAssetUrl(assetValue);
    const nestedRef = nested
      ? `${nested.assetId}.${FIELD_TO_INDEX[nested.field]}`
      : "";

    if (nestedRef === currentRef) {
      return createResponse(
        404,
        {
          error: "Asset data not found. Please upload image again and save.",
        },
        origin,
      );
    }

    if (
      nested?.assetId &&
      nested?.field &&
      IMAGE_FIELDS.includes(nested.field)
    ) {
      const nestedSettings = await settingsCollection.findOne({
        _id: new ObjectId(nested.assetId),
      });
      const nestedValue = nestedSettings?.[nested.field];

      if (
        typeof nestedValue === "string" &&
        nestedValue.startsWith("data:image/")
      ) {
        const parsed = parseDataUrl(nestedValue);

        if (!parsed) {
          return createResponse(400, { error: "Invalid image data" }, origin);
        }

        return {
          statusCode: 200,
          headers: {
            "Content-Type": parsed.mimeType,
            "Cache-Control": "public, max-age=60",
          },
          isBase64Encoded: true,
          body: parsed.data,
        };
      }
    }
  }

  const redirectUrl = normalizeHttpsUrl(assetValue);

  if (
    !redirectUrl.startsWith("https://") &&
    !redirectUrl.startsWith("http://")
  ) {
    return createResponse(400, { error: "Invalid asset URL" }, origin);
  }

  return {
    statusCode: 302,
    headers: {
      Location: redirectUrl,
      "Cache-Control": "public, max-age=60",
    },
    body: "",
  };
}

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const { assetId, field } = getAssetParams(event);

    if (event.httpMethod === "GET" && assetId && field) {
      return await handleAssetRequest(event, origin);
    }

    const user = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const settingsCollection = db.collection(SETTINGS_COLLECTION);

    if (event.httpMethod === "GET") {
      const settings = await settingsCollection.findOne({
        userId: user.userId,
      });

      return createResponse(
        200,
        {
          settings: mapSettingsForClient(settings, event),
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const payload = event.body ? JSON.parse(event.body) : {};
      const sanitizedPayload = sanitizeSettingsPayload(payload);
      const isServicesOnlyUpdate =
        Object.keys(payload).length === 1 &&
        Object.prototype.hasOwnProperty.call(payload, "services");

      if (
        !isServicesOnlyUpdate &&
        !Object.prototype.hasOwnProperty.call(sanitizedPayload, "gstin")
      ) {
        sanitizedPayload.gstin = "";
      }

      await settingsCollection.updateOne(
        { userId: user.userId },
        {
          $set: {
            ...sanitizedPayload,
            userId: user.userId,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );

      const updated = await settingsCollection.findOne({ userId: user.userId });

      return createResponse(
        200,
        {
          message: "Business settings saved successfully",
          settings: mapSettingsForClient(updated, event),
        },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Business settings API error:", error);

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(401, { error: "Unauthorized" }, origin);
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
