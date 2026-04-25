import {
  buildTermsVersionPatch,
  ensureTermsVersionDocument,
  getTermsBindingFromDatabase,
} from "../netlify/functions/utils/terms-versioning.js";

const TARGETS = [
  {
    collectionName: "invoices",
    termsKind: "invoice",
    snapshotField: "invoiceTermsConditionsSnapshot",
  },
  {
    collectionName: "rcm",
    termsKind: "selfInvoice",
    snapshotField: "selfInvoiceTermsConditionsSnapshot",
  },
  {
    collectionName: "qutations",
    termsKind: "performaInvoice",
    snapshotField: "performaInvoiceTermsConditionsSnapshot",
  },
  {
    collectionName: "creditDebitNotes",
    termsKind: "creditDebitNote",
    snapshotField: "creditDebitNoteTermsConditionsSnapshot",
  },
];

const BATCH_SIZE = 500;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const useApply = args.includes("--apply");
  const isDryRun = args.includes("--dry-run") || !useApply;

  const targetsArg = args.find((arg) => arg.startsWith("--targets="));
  const requestedTargets = targetsArg
    ? targetsArg
        .split("=")[1]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const selectedTargets =
    requestedTargets.length > 0
      ? TARGETS.filter((target) =>
          requestedTargets.includes(target.collectionName),
        )
      : TARGETS;

  return {
    isDryRun,
    selectedTargets,
  };
};

const flushBulk = async (collection, operations) => {
  if (!operations.length) return 0;
  const result = await collection.bulkWrite(operations, {
    ordered: false,
  });
  operations.length = 0;
  return Number(result.modifiedCount || 0);
};

const run = async () => {
  const { isDryRun, selectedTargets } = parseArgs();
  const mode = isDryRun ? "DRY-RUN" : "APPLY";

  if (
    !process.env.JWT_SECRET ||
    String(process.env.JWT_SECRET).trim().length < 32
  ) {
    // Migration script does not use auth tokens directly, but auth is imported transitively.
    process.env.JWT_SECRET = "migration-script-placeholder-secret-key-123456";
  }

  if (selectedTargets.length === 0) {
    console.log("No matching targets found. Nothing to do.");
    return;
  }

  console.log(`Starting terms version backfill in ${mode} mode...`);
  console.log(
    `Targets: ${selectedTargets.map((target) => target.collectionName).join(", ")}`,
  );

  const { connectToDatabase } =
    await import("../netlify/functions/utils/mongodb.js");
  const { client, db } = await connectToDatabase();

  try {
    let totalScanned = 0;
    let totalMatched = 0;
    let totalUpdated = 0;

    for (const target of selectedTargets) {
      const { collectionName, termsKind, snapshotField } = target;
      const collection = db.collection(collectionName);
      const binding = await getTermsBindingFromDatabase(db, termsKind);

      if (!binding) {
        console.log(
          `[${collectionName}] skipped: terms binding not available for ${termsKind}`,
        );
        continue;
      }

      if (!isDryRun) {
        await ensureTermsVersionDocument(db, binding);
      }

      const projection = {
        _id: 1,
        [binding.versionField]: 1,
        [snapshotField]: 1,
      };

      const cursor = collection.find({}, { projection });
      const bulkOps = [];

      let scanned = 0;
      let matched = 0;
      let updated = 0;

      for await (const doc of cursor) {
        scanned += 1;
        const patch = buildTermsVersionPatch(doc, binding);
        const hasLegacySnapshot = Object.prototype.hasOwnProperty.call(
          doc,
          snapshotField,
        );

        if (!patch && !hasLegacySnapshot) {
          continue;
        }

        matched += 1;

        if (!isDryRun) {
          const update = {};

          if (patch) {
            update.$set = patch;
          }

          if (hasLegacySnapshot) {
            update.$unset = {
              [snapshotField]: "",
            };
          }

          bulkOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update,
            },
          });

          if (bulkOps.length >= BATCH_SIZE) {
            updated += await flushBulk(collection, bulkOps);
          }
        }
      }

      if (!isDryRun && bulkOps.length > 0) {
        updated += await flushBulk(collection, bulkOps);
      }

      totalScanned += scanned;
      totalMatched += matched;
      totalUpdated += updated;

      console.log(
        `[${collectionName}] scanned=${scanned}, matched=${matched}, updated=${updated}, versionField=${binding.versionField}, removedSnapshotField=${snapshotField}`,
      );
    }

    console.log(
      `Backfill completed. totalScanned=${totalScanned}, totalMatched=${totalMatched}, totalUpdated=${totalUpdated}`,
    );
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error("Terms version backfill failed:", error);
  process.exit(1);
});
