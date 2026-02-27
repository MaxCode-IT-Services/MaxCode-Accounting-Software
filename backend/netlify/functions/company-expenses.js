import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Company Expense Management API
 * Handles CRUD operations for company expenses
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
    const expensesCollection = db.collection("company_expenses");

    if (event.httpMethod === "GET") {
      const { id, financialYear } = event.queryStringParameters || {};

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid expense ID" }, origin);
        }

        const expense = await expensesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!expense) {
          return createResponse(404, { error: "Expense not found" }, origin);
        }

        return createResponse(200, expense, origin);
      }

      const query = { isDeleted: { $ne: true } };
      if (financialYear) {
        query.financialYear = financialYear;
      }

      const expenses = await expensesCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      return createResponse(200, expenses, origin);
    }

    if (event.httpMethod === "POST") {
      const expenseData = JSON.parse(event.body || "{}");

      // Validate required fields
      if (!expenseData.expenseNumber) {
        return createResponse(
          400,
          { error: "Expense number is required" },
          origin,
        );
      }
      if (!expenseData.expenseDate) {
        return createResponse(
          400,
          { error: "Expense date is required" },
          origin,
        );
      }
      if (!expenseData.financialYear) {
        return createResponse(
          400,
          { error: "Financial year is required" },
          origin,
        );
      }

      // Validate expense number format: MC/CEXP/YY-YY/0001
      const expenseNumberRegex = /^MC\/CEXP\/\d{2}-\d{2}\/\d{4}$/;
      if (!expenseNumberRegex.test(expenseData.expenseNumber)) {
        return createResponse(
          400,
          {
            error:
              "Expense number format is invalid. It should be MC/CEXP/YY-YY/0001.",
          },
          origin,
        );
      }

      // Validate amount
      const amount = parseFloat(
        expenseData.amount || expenseData?.taxData?.totalAmount || 0,
      );
      if (Number.isNaN(amount) || amount <= 0) {
        return createResponse(
          400,
          { error: "Valid amount is required" },
          origin,
        );
      }

      // Validate expense date is within selected financial year
      const { db } = await connectToDatabase();
      const yearsCollection = db.collection("financialYears");
      const yearDoc = await yearsCollection.findOne({
        value: expenseData.financialYear,
        isDeleted: { $ne: true },
      });
      if (!yearDoc) {
        return createResponse(
          400,
          { error: "Selected financial year does not exist." },
          origin,
        );
      }
      const expenseDateObj = new Date(expenseData.expenseDate);
      if (
        isNaN(expenseDateObj.getTime()) ||
        expenseDateObj < new Date(yearDoc.startDate) ||
        expenseDateObj > new Date(yearDoc.endDate)
      ) {
        return createResponse(
          400,
          {
            error: `Expense date must be within the selected financial year (${yearDoc.startDate} to ${yearDoc.endDate}).`,
          },
          origin,
        );
      }

      // Validate expense number uniqueness per financial year
      const existingExpense = await expensesCollection.findOne({
        expenseNumber: expenseData.expenseNumber,
        financialYear: expenseData.financialYear,
        isDeleted: { $ne: true },
      });
      if (existingExpense) {
        return createResponse(
          409,
          { error: "Expense number already exists for this financial year." },
          origin,
        );
      }

      // Always assign _id as ObjectId
      const normalizedExpense = {
        ...expenseData,
        _id: new ObjectId(),
        amount,
        taxData: {
          taxableAmount: amount,
          subtotal: amount,
          totalAmount: amount,
          cgst: 0,
          sgst: 0,
          igst: 0,
          taxPercentage: 0,
        },
        invoiceType: "No GST",
        updatedAt: new Date(),
        createdAt: new Date(),
      };
      const result = await expensesCollection.insertOne(normalizedExpense);

      return createResponse(
        201,
        {
          message: "Company expense created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Expense ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid expense ID" }, origin);
      }

      const expenseData = JSON.parse(event.body || "{}");
      const expenseObjectId = new ObjectId(id);

      if (expenseData.expenseNumber) {
        const existingExpense = await expensesCollection.findOne({
          expenseNumber: expenseData.expenseNumber,
        });

        if (existingExpense && String(existingExpense._id) !== String(id)) {
          return createResponse(
            409,
            { error: "Expense number already exists" },
            origin,
          );
        }
      }

      const amount = parseFloat(
        expenseData.amount || expenseData?.taxData?.totalAmount || 0,
      );
      if (Number.isNaN(amount) || amount <= 0) {
        return createResponse(
          400,
          { error: "Valid amount is required" },
          origin,
        );
      }

      const result = await expensesCollection.updateOne(
        { _id: expenseObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...expenseData,
            amount,
            taxData: {
              taxableAmount: amount,
              subtotal: amount,
              totalAmount: amount,
              cgst: 0,
              sgst: 0,
              igst: 0,
              taxPercentage: 0,
            },
            invoiceType: "No GST",
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Expense not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Company expense updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Expense ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid expense ID" }, origin);
      }

      const result = await expensesCollection.updateOne(
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
        return createResponse(404, { error: "Expense not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Company expense deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Company Expense API Error:", error);

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
