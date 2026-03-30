import { hashPassword } from "./auth";

async function ensureNotificationRunsUniqueIndex(db) {
  const notificationRunsCollection = db.collection("notificationRuns");

  const duplicateGroups = await notificationRunsCollection
    .aggregate([
      {
        $group: {
          _id: {
            dateKey: "$dateKey",
            notificationType: "$notificationType",
          },
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          "_id.dateKey": { $type: "string" },
          "_id.notificationType": { $type: "string" },
          count: { $gt: 1 },
        },
      },
    ])
    .toArray();

  if (duplicateGroups.length > 0) {
    const duplicateIdsToDelete = [];

    duplicateGroups.forEach((group) => {
      const ids = Array.isArray(group?.ids) ? group.ids : [];
      if (ids.length <= 1) return;
      // Keep first document, delete the rest.
      duplicateIdsToDelete.push(...ids.slice(1));
    });

    if (duplicateIdsToDelete.length > 0) {
      await notificationRunsCollection.deleteMany({
        _id: { $in: duplicateIdsToDelete },
      });
    }
  }

  await notificationRunsCollection.createIndex(
    { dateKey: 1, notificationType: 1 },
    { unique: true, name: "dateKey_notificationType" },
  );
}

export async function setupDb(db) {
  const usersCollection = db.collection("users");

  await usersCollection.createIndex({ phone: 1 }, { unique: true });

  await Promise.all([
    db.collection("clients").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      { key: { isDeleted: 1, status: 1 }, name: "isDeleted_status" },
      { key: { isDeleted: 1, hasGSTIN: 1 }, name: "isDeleted_hasGSTIN" },
    ]),
    db.collection("vendors").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      { key: { isDeleted: 1, status: 1 }, name: "isDeleted_status" },
      { key: { isDeleted: 1, hasGSTIN: 1 }, name: "isDeleted_hasGSTIN" },
    ]),
    db.collection("staff").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      { key: { isDeleted: 1, status: 1 }, name: "isDeleted_status" },
      { key: { isDeleted: 1, department: 1 }, name: "isDeleted_department" },
    ]),
    db.collection("financialYears").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      { key: { isDeleted: 1, status: 1 }, name: "isDeleted_status" },
      {
        key: { isDeleted: 1, financialYear: 1 },
        name: "isDeleted_financialYear",
      },
    ]),
    db.collection("services").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      {
        key: { isDeleted: 1, businessName: 1 },
        name: "isDeleted_businessName",
      },
    ]),
    db.collection("invoices").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      {
        key: { isDeleted: 1, paymentStatus: 1 },
        name: "isDeleted_paymentStatus",
      },
    ]),
    db.collection("purchases").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      {
        key: { isDeleted: 1, paymentStatus: 1 },
        name: "isDeleted_paymentStatus",
      },
    ]),
    db.collection("rcm").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      {
        key: { isDeleted: 1, paymentStatus: 1 },
        name: "isDeleted_paymentStatus",
      },
    ]),
    db.collection("projects").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      {
        key: { isDeleted: 1, businessName: 1 },
        name: "isDeleted_businessName",
      },
    ]),
    db.collection("notifications").createIndexes([
      { key: { isDeleted: 1, createdAt: -1 }, name: "isDeleted_createdAt" },
      {
        key: { dateKey: 1, templateType: 1, isDeleted: 1 },
        name: "dateKey_templateType_isDeleted",
      },
      {
        key: { isDeleted: 1, "readBy.userId": 1, createdAt: -1 },
        name: "isDeleted_readByUserId_createdAt",
      },
    ]),
    db
      .collection("userPreferences")
      .createIndexes([
        { key: { userId: 1 }, name: "userId_unique", unique: true },
      ]),
  ]);

  try {
    await ensureNotificationRunsUniqueIndex(db);
  } catch (error) {
    // One retry handles race conditions where duplicates are inserted during startup.
    if (error?.code === 11000) {
      await ensureNotificationRunsUniqueIndex(db);
    } else {
      throw error;
    }
  }

  //create first admin user if not exists

  const isUserExists = await usersCollection.findOne({
    phone: process.env.SUPER_ADMIN_NUMBER,
  });

  if (!isUserExists) {
    await usersCollection.insertOne({
      name: process.env.SUPER_ADMIN_NAME,
      phone: process.env.SUPER_ADMIN_NUMBER,
      pin: await hashPassword(process.env.SUPER_ADMIN_PIN),
      role: "admin",
      createdAt: new Date(),
    });
  }
}
