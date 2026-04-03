import { ObjectId } from "mongodb";

const PERMISSION_FLAGS = [
  "create",
  "read",
  "update",
  "delete",
  "export",
  "showTableData",
  "selfData",
  "allData",
];

const normalizePagePermissions = (pagePermissions = {}) => {
  if (!pagePermissions || typeof pagePermissions !== "object") {
    return {};
  }

  const normalized = {
    create: false,
    read: false,
    update: false,
    delete: false,
    export: false,
    showTableData: false,
    selfData: false,
    allData: false,
    ...pagePermissions,
  };

  if (
    normalized.tableData !== undefined &&
    normalized.showTableData === undefined
  ) {
    normalized.showTableData = normalized.tableData === true;
  }

  delete normalized.tableData;

  PERMISSION_FLAGS.forEach((flag) => {
    if (normalized[flag] !== undefined) {
      normalized[flag] = normalized[flag] === true;
    }
  });

  return normalized;
};

const normalizePermissions = (permissions = {}) => {
  if (!permissions || typeof permissions !== "object") {
    return {};
  }

  const normalized = { ...permissions };

  Object.entries(normalized).forEach(([moduleKey, modulePermission]) => {
    if (!modulePermission || typeof modulePermission !== "object") {
      return;
    }

    if (!modulePermission.pages || typeof modulePermission.pages !== "object") {
      return;
    }

    normalized[moduleKey] = {
      ...modulePermission,
      pages: Object.fromEntries(
        Object.entries(modulePermission.pages).map(
          ([pageName, pagePermissions]) => [
            pageName,
            normalizePagePermissions(pagePermissions),
          ],
        ),
      ),
    };
  });

  return normalized;
};

const deepEqual = (left, right) =>
  JSON.stringify(left) === JSON.stringify(right);

const parseArgs = () => {
  const args = process.argv.slice(2);
  const useApply = args.includes("--apply");
  const isDryRun = args.includes("--dry-run") || !useApply;

  return { isDryRun };
};

const run = async () => {
  if (
    !process.env.JWT_SECRET ||
    String(process.env.JWT_SECRET).trim().length < 32
  ) {
    process.env.JWT_SECRET = "migration-script-placeholder-secret-key-123456";
  }

  const { isDryRun } = parseArgs();
  const mode = isDryRun ? "DRY-RUN" : "APPLY";

  console.log(
    `Starting team-member permission normalization in ${mode} mode...`,
  );

  const { connectToDatabase } =
    await import("../netlify/functions/utils/mongodb.js");
  const { client, db } = await connectToDatabase();
  const usersCollection = db.collection("users");

  try {
    const docs = await usersCollection
      .find(
        {
          userType: "team-member",
          permissions: { $exists: true, $type: "object" },
        },
        {
          projection: {
            _id: 1,
            permissions: 1,
          },
        },
      )
      .toArray();

    let matched = 0;
    let updated = 0;
    const bulkOps = [];

    for (const doc of docs) {
      const nextPermissions = normalizePermissions(doc.permissions);

      if (deepEqual(nextPermissions, doc.permissions)) {
        continue;
      }

      matched += 1;

      if (!isDryRun) {
        bulkOps.push({
          updateOne: {
            filter: { _id: new ObjectId(doc._id) },
            update: {
              $set: {
                permissions: nextPermissions,
              },
            },
          },
        });
      }
    }

    if (!isDryRun && bulkOps.length > 0) {
      const result = await usersCollection.bulkWrite(bulkOps, {
        ordered: false,
      });
      updated = result.modifiedCount || 0;
    }

    console.log(
      `Team-member permissions normalization complete. scanned=${docs.length}, matched=${matched}, updated=${updated}`,
    );
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error("Team-member permission normalization failed:", error);
  process.exit(1);
});
