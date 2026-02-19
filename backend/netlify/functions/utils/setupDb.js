import { hashPassword } from "./auth";

export async function setupDb(db) {
  const usersCollection = db.collection("users");

  usersCollection.createIndex({ phone: 1 }, { unique: true });

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
