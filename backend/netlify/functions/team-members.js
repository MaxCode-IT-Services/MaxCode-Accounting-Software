import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, hashPassword } from "./utils/auth.js";

const normalizePermissions = (permissions = {}) => {
  if (!permissions || typeof permissions !== "object") {
    return {};
  }

  return permissions;
};

const ROLE_VALUES = new Set(["Team", "Admin", "Super Admin"]);

const normalizeRole = (role = "") => {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();

  if (!normalized) return "";
  if (normalized === "team") return "Team";
  if (normalized === "admin") return "Admin";
  if (
    normalized === "super admin" ||
    normalized === "superadmin" ||
    normalized === "master admin" ||
    normalized === "masteradmin"
  ) {
    return "Super Admin";
  }

  return "";
};

/**
 * Team Members Management API
 * Handles CRUD operations for permission-based users
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");

    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
      } = event.queryStringParameters || {};

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(
            400,
            { error: "Invalid team member ID" },
            origin,
          );
        }
        const teamMember = await usersCollection.findOne({
          _id: new ObjectId(id),
          userType: "team-member",
          isDeleted: { $ne: true },
        });
        if (!teamMember) {
          return createResponse(
            404,
            { error: "Team member not found" },
            origin,
          );
        }
        return createResponse(
          200,
          {
            ...teamMember,
            pin: "",
          },
          origin,
        );
      }

      const params = event.queryStringParameters || {};
      const filterQuery = {
        userType: "team-member",
        isDeleted: { $ne: true },
      };

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter") return;

        if (
          ["id", "page", "limit", "search", "sortBy", "sortOrder"].includes(key)
        ) {
          return;
        }

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

        if (["status", "role"].includes(key)) {
          const normalized = key === "role" ? normalizeRole(value) : value;
          if (normalized) {
            filterQuery[key] = String(normalized).trim();
          }
          return;
        }

        filterQuery[key] = { $regex: String(value).trim(), $options: "i" };
      });

      const dateRanges = {};
      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          let baseKey = key.replace(/_start$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = String(value).split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$gte = new Date(
              Date.UTC(year, month, day, 0, 0, 0, 0),
            );
          }
        }

        if (key.endsWith("_end")) {
          let baseKey = key.replace(/_end$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = String(value).split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$lte = new Date(
              Date.UTC(year, month, day, 23, 59, 59, 999),
            );
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      if (filter) {
        if (filter === "active") {
          filterQuery.status = "Active";
        }
        if (filter === "inactive") {
          filterQuery.status = "Inactive";
        }
        if (filter === "admins") {
          filterQuery.role = { $in: ["Admin", "Super Admin"] };
        }
        if (filter === "teams") {
          filterQuery.role = "Team";
        }
      }

      if (search) {
        filterQuery.$and = [
          ...(Array.isArray(filterQuery.$and) ? filterQuery.$and : []),
          {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { phone: { $regex: search, $options: "i" } },
              { email: { $regex: search, $options: "i" } },
              { address: { $regex: search, $options: "i" } },
              { role: { $regex: search, $options: "i" } },
            ],
          },
        ];
      }

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
      const skip = (pageNum - 1) * limitNum;

      const sortFieldMapping = {
        createdDateTime: "createdAt",
        phoneNumber: "phone",
      };

      const sortObject = {};
      sortObject[sortFieldMapping[sortBy] || sortBy] =
        sortOrder === "asc" ? 1 : -1;

      const totalRecords = await usersCollection.countDocuments(filterQuery);

      const teamMembers = await usersCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const [
        roleValues,
        statusValues,
        totalActive,
        totalInactive,
        totalAdmins,
        totalTeams,
      ] = await Promise.all([
        usersCollection.distinct("role", {
          userType: "team-member",
          isDeleted: { $ne: true },
          role: { $exists: true, $ne: "" },
        }),
        usersCollection.distinct("status", {
          userType: "team-member",
          isDeleted: { $ne: true },
          status: { $exists: true, $ne: "" },
        }),
        usersCollection.countDocuments({
          userType: "team-member",
          isDeleted: { $ne: true },
          status: "Active",
        }),
        usersCollection.countDocuments({
          userType: "team-member",
          isDeleted: { $ne: true },
          status: "Inactive",
        }),
        usersCollection.countDocuments({
          userType: "team-member",
          isDeleted: { $ne: true },
          role: { $in: ["Admin", "Super Admin"] },
        }),
        usersCollection.countDocuments({
          userType: "team-member",
          isDeleted: { $ne: true },
          role: "Team",
        }),
      ]);

      return createResponse(
        200,
        {
          data: teamMembers.map((member) => ({
            ...member,
            pin: "",
          })),
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: totalRecords,
            active: totalActive,
            inactive: totalInactive,
            admins: totalAdmins,
            teams: totalTeams,
          },
          filterOptions: {
            role: ["All", ...roleValues.sort()],
            status: ["All", ...statusValues.sort()],
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");

      const requiredFields = [
        "name",
        "phone",
        "email",
        "address",
        "role",
        "pin",
      ];
      for (const field of requiredFields) {
        if (!payload[field] || payload[field].toString().trim() === "") {
          return createResponse(400, { error: `${field} is required` }, origin);
        }
      }

      if (!/^\d{10}$/.test(payload.phone)) {
        return createResponse(
          400,
          { error: "Phone must be exactly 10 digits" },
          origin,
        );
      }

      if (!/^\d{6}$/.test(payload.pin)) {
        return createResponse(
          400,
          { error: "PIN must be exactly 6 digits" },
          origin,
        );
      }

      const existingPhone = await usersCollection.findOne({
        phone: payload.phone,
        isDeleted: { $ne: true },
      });

      if (existingPhone) {
        return createResponse(
          409,
          { error: "Phone already registered. Please use another phone." },
          origin,
        );
      }

      const existingEmail = await usersCollection.findOne({
        email: payload.email,
        isDeleted: { $ne: true },
      });

      if (existingEmail) {
        return createResponse(
          409,
          { error: "Email already registered. Please use another email." },
          origin,
        );
      }

      const hashedPin = await hashPassword(payload.pin);
      const status = payload.status === "Inactive" ? "Inactive" : "Active";
      const role = normalizeRole(payload.role);

      if (!ROLE_VALUES.has(role)) {
        return createResponse(
          400,
          { error: "Role must be one of: Team, Admin, Super Admin" },
          origin,
        );
      }

      const newTeamMember = {
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        address: payload.address,
        role,
        pin: hashedPin,
        status,
        sendEmail: payload.sendEmail === true,
        permissions: normalizePermissions(payload.permissions),
        userType: "team-member",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Always assign _id as ObjectId
      const docToInsert = {
        ...newTeamMember,
        _id: new ObjectId(),
      };
      const result = await usersCollection.insertOne(docToInsert);

      return createResponse(
        201,
        {
          message: "Team member created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(
          400,
          { error: "Team member ID is required" },
          origin,
        );
      }
      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid team member ID" }, origin);
      }
      const payload = JSON.parse(event.body || "{}");
      const memberObjectId = new ObjectId(id);

      if (payload.phone) {
        if (!/^\d{10}$/.test(payload.phone)) {
          return createResponse(
            400,
            { error: "Phone must be exactly 10 digits" },
            origin,
          );
        }

        const existingPhone = await usersCollection.findOne({
          _id: { $ne: memberObjectId },
          phone: payload.phone,
          isDeleted: { $ne: true },
        });

        if (existingPhone) {
          return createResponse(
            409,
            { error: "Phone already registered with another user." },
            origin,
          );
        }
      }

      if (payload.email) {
        const existingEmail = await usersCollection.findOne({
          _id: { $ne: memberObjectId },
          email: payload.email,
          isDeleted: { $ne: true },
        });

        if (existingEmail) {
          return createResponse(
            409,
            { error: "Email already registered with another user." },
            origin,
          );
        }
      }

      const updateData = {
        ...payload,
        updatedAt: new Date(),
      };

      if (payload.role !== undefined) {
        const role = normalizeRole(payload.role);
        if (!ROLE_VALUES.has(role)) {
          return createResponse(
            400,
            { error: "Role must be one of: Team, Admin, Super Admin" },
            origin,
          );
        }
        updateData.role = role;
      }

      if (payload.permissions !== undefined) {
        updateData.permissions = normalizePermissions(payload.permissions);
      }

      if (payload.pin && payload.pin.trim() !== "") {
        if (!/^\d{6}$/.test(payload.pin)) {
          return createResponse(
            400,
            { error: "PIN must be exactly 6 digits" },
            origin,
          );
        }
        updateData.pin = await hashPassword(payload.pin);
      } else {
        delete updateData.pin;
      }

      const result = await usersCollection.updateOne(
        {
          _id: memberObjectId,
          userType: "team-member",
          isDeleted: { $ne: true },
        },
        {
          $set: updateData,
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Team member not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Team member updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(
          400,
          { error: "Team member ID is required" },
          origin,
        );
      }
      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid team member ID" }, origin);
      }
      const result = await usersCollection.updateOne(
        {
          _id: new ObjectId(id),
          userType: "team-member",
          isDeleted: { $ne: true },
        },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Team member not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Team member deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Team Members API Error:", error);

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(
        401,
        {
          error: "Unauthorized",
          message: error.message,
        },
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
