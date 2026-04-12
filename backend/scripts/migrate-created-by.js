import { ObjectId } from "mongodb";

const DEFAULT_CREATED_BY = "Vipin Khandelwal";

const TARGET_COLLECTIONS = [
  "clients",
  "vendors",
  "leads",
  "invoices",
  "services",
  "rcm",
  "qutations",
  "purchases",
  "company_expenses",
  "projects",
  "projectCredentials",
  "maxcodeCredentials",
  "personalFunds",
  "staff",
  "financialYears",
  "users",
];

const NAME_CANDIDATE_FIELDS = [
  "createdByName",
  "creatorName",
  "userName",
  "addedByName",
  "ownerName",
  "updatedByName",
  "updatedBy",
  "createdBy",
  "addedBy",
];

const ID_CANDIDATE_FIELDS = [
  "createdById",
  "createdByUserId",
  "userId",
  "ownerId",
  "teamMemberId",
  "updatedById",
  "createdBy",
];

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const useApply = args.includes("--apply");
  const isDryRun = args.includes("--dry-run") || !useApply;

  const collectionsArg = args.find((arg) => arg.startsWith("--collections="));
  const collections = collectionsArg
    ? collectionsArg
        .split("=")[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : TARGET_COLLECTIONS;

  return {
    isDryRun,
    collections,
  };
};

const normalizeIdString = (value) => {
  if (!hasValue(value)) return "";
  if (typeof value === "object" && value instanceof ObjectId) {
    return value.toString();
  }
  if (typeof value === "object") {
    const nested = value._id || value.id || value.userId || value.ownerId;
    return nested ? String(nested) : "";
  }
  return String(value);
};

const normalizeNameString = (value) => {
  if (!hasValue(value)) return "";
  if (typeof value === "object") {
    const nested =
      value.name ||
      value.fullName ||
      value.displayName ||
      value.userName ||
      value.email ||
      value.phone;
    return nested ? String(nested) : "";
  }
  return String(value);
};

const resolveFromCandidates = (doc, fields, normalizer) => {
  for (const field of fields) {
    const normalized = normalizer(doc?.[field]);
    if (hasValue(normalized)) {
      return normalized;
    }
  }
  return "";
};

const resolveUserNameById = async (usersCollection, idValue) => {
  if (!hasValue(idValue)) return "";
  const idString = String(idValue);

  const idFilters = [];
  if (ObjectId.isValid(idString)) {
    idFilters.push({ _id: new ObjectId(idString) });
  }

  idFilters.push({ _id: idString });
  idFilters.push({ id: idString });
  idFilters.push({ userId: idString });

  const user = await usersCollection.findOne(
    { $or: idFilters },
    {
      projection: {
        name: 1,
        userName: 1,
        displayName: 1,
        email: 1,
        phone: 1,
      },
    },
  );

  if (!user) return "";

  return (
    user.name ||
    user.userName ||
    user.displayName ||
    user.email ||
    user.phone ||
    ""
  );
};

const buildAuditPatch = async (doc, usersCollection) => {
  const existingCreatedBy = normalizeNameString(doc.createdBy);
  const existingCreatedById = normalizeIdString(doc.createdById);
  const existingCreatedByName = normalizeNameString(doc.createdByName);

  let createdById =
    existingCreatedById ||
    resolveFromCandidates(doc, ID_CANDIDATE_FIELDS, normalizeIdString);

  let createdByName =
    existingCreatedByName ||
    resolveFromCandidates(doc, NAME_CANDIDATE_FIELDS, normalizeNameString);

  if (!hasValue(createdByName) && hasValue(createdById)) {
    createdByName = await resolveUserNameById(usersCollection, createdById);
  }

  let createdBy = existingCreatedBy;
  if (!hasValue(createdBy)) {
    createdBy = createdByName || createdById || DEFAULT_CREATED_BY;
  }

  if (!hasValue(createdByName)) {
    createdByName =
      createdBy === DEFAULT_CREATED_BY
        ? DEFAULT_CREATED_BY
        : createdByName || createdBy;
  }

  const patch = {
    createdBy,
    createdByName,
  };

  if (hasValue(createdById)) {
    patch.createdById = createdById;
  }

  return patch;
};

const run = async () => {
  if (
    !process.env.JWT_SECRET ||
    String(process.env.JWT_SECRET).trim().length < 32
  ) {
    // Migration script does not use auth tokens, but auth module is imported transitively.
    process.env.JWT_SECRET = "migration-script-placeholder-secret-key-123456";
  }

  const { isDryRun, collections } = parseArgs();
  const mode = isDryRun ? "DRY-RUN" : "APPLY";

  console.log(`Starting Created By migration in ${mode} mode...`);
  console.log(`Collections: ${collections.join(", ")}`);

  const { connectToDatabase } =
    await import("../netlify/functions/utils/mongodb.js");
  const { client, db } = await connectToDatabase();
  const usersCollection = db.collection("users");

  try {
    let grandTotalScanned = 0;
    let grandTotalMatched = 0;
    let grandTotalUpdated = 0;

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const query = {
        $or: [
          { createdBy: { $exists: false } },
          { createdBy: null },
          { createdBy: "" },
          { createdByName: { $exists: false } },
          { createdByName: null },
          { createdByName: "" },
        ],
      };

      const docs = await collection
        .find(query, {
          projection: {
            _id: 1,
            createdBy: 1,
            createdById: 1,
            createdByName: 1,
            createdByUserId: 1,
            userId: 1,
            ownerId: 1,
            teamMemberId: 1,
            updatedBy: 1,
            updatedById: 1,
            updatedByName: 1,
            userName: 1,
            creatorName: 1,
            addedByName: 1,
            ownerName: 1,
            addedBy: 1,
          },
        })
        .toArray();

      const scanned = await collection.countDocuments({});
      const matched = docs.length;

      grandTotalScanned += scanned;
      grandTotalMatched += matched;

      if (matched === 0) {
        console.log(
          `[${collectionName}] scanned=${scanned}, matched=0, updated=0`,
        );
        continue;
      }

      const bulkOps = [];
      for (const doc of docs) {
        const patch = await buildAuditPatch(doc, usersCollection);
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                ...patch,
                migrationUpdatedAt: new Date(),
              },
            },
          },
        });
      }

      if (isDryRun) {
        console.log(
          `[${collectionName}] scanned=${scanned}, matched=${matched}, wouldUpdate=${bulkOps.length}`,
        );
        console.log(
          `[${collectionName}] samplePatch=`,
          JSON.stringify(bulkOps[0]?.updateOne?.update?.$set || {}, null, 2),
        );
      } else {
        const result = await collection.bulkWrite(bulkOps, { ordered: false });
        const updated = result.modifiedCount || 0;
        grandTotalUpdated += updated;
        console.log(
          `[${collectionName}] scanned=${scanned}, matched=${matched}, updated=${updated}`,
        );
      }
    }

    console.log("--- Migration Summary ---");
    console.log(`Total scanned: ${grandTotalScanned}`);
    console.log(`Total matched: ${grandTotalMatched}`);
    if (isDryRun) {
      console.log(`Total to update: ${grandTotalMatched}`);
    } else {
      console.log(`Total updated: ${grandTotalUpdated}`);
    }
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error("Created By migration failed:", error);
  process.exit(1);
});
