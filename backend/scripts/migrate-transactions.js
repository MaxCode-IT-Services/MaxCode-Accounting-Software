import dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { connectToDatabase } from "../netlify/functions/utils/mongodb.js";
import { buildTransactionSnapshot } from "../netlify/functions/utils/transactions.js";

const TARGET_COLLECTIONS = [
  { name: "invoices", sourceType: "invoice" },
  { name: "purchases", sourceType: "purchase" },
  { name: "company_expenses", sourceType: "company-expense" },
  { name: "creditDebitNotes", sourceType: "credit-debit-note" },
  { name: "payment_receipts", sourceType: "payment-receipt" },
  { name: "rcm", sourceType: "rcm" },
  { name: "personalFunds", sourceType: "owner-investment" },
  { name: "projects", sourceType: "project" },
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run") || !args.includes("--apply");
  const force = args.includes("--force") || args.includes("--rebuild");
  const collectionsArg = args.find((arg) => arg.startsWith("--collections="));

  const collections = collectionsArg
    ? collectionsArg
        .split("=")[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : TARGET_COLLECTIONS.map((entry) => entry.name);

  return { isDryRun, force, collections };
};

const getSourceLabel = (sourceType, record = {}) => {
  switch (sourceType) {
    case "invoice":
      return record.invoiceNumber || record.invoiceNo || "";
    case "purchase":
      return record.invoiceNumber || record.purchaseNumber || "";
    case "company-expense":
      return record.expenseNumber || "";
    case "credit-debit-note":
      return (
        record.noteNumber ||
        record.creditNoteNumber ||
        record.debitNoteNumber ||
        ""
      );
    case "payment-receipt":
      return record.receiptNumber || "";
    case "rcm":
      return record.selfInvoiceNumber || "";
    case "owner-investment":
      return record.fundNumber || record.receiptNumber || "";
    case "project":
      return (
        record.projectId || record.projectNumber || record.projectName || ""
      );
    default:
      return "";
  }
};

const normalizeSourceRecord = (record = {}) => {
  if (!record || typeof record !== "object") return record;

  const normalized = { ...record };
  if (normalized._id instanceof ObjectId) {
    normalized._id = normalized._id.toString();
  }

  return normalized;
};

const run = async () => {
  const { isDryRun, force, collections } = parseArgs();
  const mode = isDryRun ? "DRY-RUN" : "APPLY";

  const { db } = await connectToDatabase();
  const transactionsCollection = db.collection("transactions");

  console.log(`Starting transaction migration in ${mode} mode`);
  console.log(`Collections: ${collections.join(", ")}`);

  const stats = [];

  for (const collectionName of collections) {
    const config = TARGET_COLLECTIONS.find(
      (entry) => entry.name === collectionName,
    );
    if (!config) {
      console.log(`Skipping unknown collection: ${collectionName}`);
      continue;
    }

    const collection = db.collection(collectionName);
    const sourceRecords = await collection
      .find({ isDeleted: { $ne: true } })
      .toArray();
    let inserted = 0;
    let skipped = 0;
    let balanced = 0;

    for (const sourceRecord of sourceRecords) {
      const normalizedRecord = normalizeSourceRecord(sourceRecord);
      const snapshot = buildTransactionSnapshot({
        sourceType: config.sourceType,
        sourceCollection: collectionName,
        sourceRecord: normalizedRecord,
        sourceLabel: getSourceLabel(config.sourceType, normalizedRecord),
      });

      if (!force) {
        const existing = await transactionsCollection.findOne({
          sourceKey: snapshot.sourceKey,
          isDeleted: { $ne: true },
        });

        if (existing) {
          skipped += 1;
          continue;
        }
      }

      if (snapshot.balanced) {
        balanced += 1;
      }

      if (!isDryRun) {
        await transactionsCollection.insertOne(snapshot);
      }
      inserted += 1;
    }

    stats.push({
      collectionName,
      scanned: sourceRecords.length,
      inserted,
      skipped,
      balanced,
    });

    console.log(
      `${collectionName}: scanned=${sourceRecords.length}, inserted=${inserted}, skipped=${skipped}, balanced=${balanced}`,
    );
  }

  const totalInserted = stats.reduce((sum, row) => sum + row.inserted, 0);
  const totalBalanced = stats.reduce((sum, row) => sum + row.balanced, 0);

  console.log(
    `Migration complete. totalInserted=${totalInserted}, balancedSnapshots=${totalBalanced}`,
  );
  if (isDryRun) {
    console.log("Dry run only. Re-run with --apply to write transactions.");
  }
};

run().catch((error) => {
  console.error("Transaction migration failed:", error);
  process.exitCode = 1;
});
