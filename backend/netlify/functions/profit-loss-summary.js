// D:\MaxCode Accounting Software\backend\netlify\functions\profit-loss-summary.js
import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { normalizeTransactionSnapshot } from "./utils/transactions.js";

const toNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "").trim();
    if (!sanitized) return 0;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (v) => {
  const num = toNumber(v);
  return Math.round(num * 100) / 100;
};

const getOpeningBalances = async (db, financialYear) => {
  const yearsCollection = db.collection("financialYears");
  const yearRecord = await yearsCollection.findOne({
    financialYear,
    isDeleted: { $ne: true },
  });

  if (!yearRecord) return {};

  return {
    openingStock: round2(
      toNumber(yearRecord.openingInventory || yearRecord.closingStock || 0),
    ),
    openingCash: round2(toNumber(yearRecord.openingCash || 0)),
    openingBank: round2(toNumber(yearRecord.openingBank || 0)),
    openingGstInput: round2(
      toNumber(yearRecord.openingCgstItc || yearRecord.openingItcCgst || 0) +
        toNumber(yearRecord.openingSgstItc || yearRecord.openingItcSgst || 0) +
        toNumber(yearRecord.openingIgstItc || yearRecord.openingItcIgst || 0) +
        toNumber(yearRecord.openingItc || yearRecord.openingGstInput || 0),
    ),
    openingCapital: round2(
      toNumber(
        yearRecord.openingCapital ||
          yearRecord.capitalAmount ||
          yearRecord.ownerCapital ||
          0,
      ),
    ),
  };
};

const calculateProfitLossFromTransactions = (
  transactions,
  openingBalances = {},
) => {
  // INCOME accounts
  let salesRevenue = 0; // Sales (excluding GST)
  let serviceRevenue = 0; // Services (excluding GST)
  let otherIncome = 0; // Other income sources
  let discountReceived = 0; // Purchase discounts

  // EXPENSE accounts
  let purchaseExpense = 0; // Purchases (excluding GST)
  let companyExpenses = 0; // Company expenses
  let rcmExpense = 0; // RCM expenses
  let developerPayoutExpense = 0; // Developer payouts
  let directExpenses = 0; // Direct expenses
  let indirectExpenses = 0; // Indirect expenses
  let fdPenaltyExpense = 0; // FD closure penalties

  // GST adjustments
  let gstOutputTotal = 0;
  let gstInputTotal = 0;

  // Cash / bank / equity movement tracking for a Tally-style position snapshot
  let cashDebit = 0;
  let cashCredit = 0;
  let bankDebit = 0;
  let bankCredit = 0;
  let ownerInvestmentDebit = 0;
  let ownerInvestmentCredit = 0;
  let ownerWithdrawalDebit = 0;
  let ownerWithdrawalCredit = 0;

  // Opening stock
  let openingStock = round2(openingBalances.openingStock || 0);

  // Track closing stock from inventory adjustments
  let closingStock = openingStock;

  for (const transaction of transactions) {
    const sourceType = (transaction.sourceType || "").toLowerCase().trim();

    for (const line of transaction.lines || []) {
      const accountHead = line.accountHead || "";
      const debit = round2(toNumber(line.debit));
      const credit = round2(toNumber(line.credit));

      // === INCOME DETECTION ===
      if (
        accountHead === "Sales Account" ||
        accountHead === "Sales Revenue Account"
      ) {
        salesRevenue = round2(salesRevenue + credit - debit);
      } else if (
        accountHead === "Service Revenue Account" ||
        accountHead === "Services Account"
      ) {
        serviceRevenue = round2(serviceRevenue + credit - debit);
      } else if (
        accountHead === "Other Income Account" ||
        accountHead === "Miscellaneous Income Account"
      ) {
        otherIncome = round2(otherIncome + credit - debit);
      } else if (
        accountHead === "Discount Received Account" ||
        accountHead === "Purchase Discount Account"
      ) {
        discountReceived = round2(discountReceived + credit - debit);
      }

      // === EXPENSE DETECTION ===
      else if (
        accountHead === "Purchase Account" ||
        accountHead === "Purchases Account"
      ) {
        purchaseExpense = round2(purchaseExpense + debit - credit);
      } else if (
        accountHead === "Company Expense Account" ||
        accountHead === "Expense Account"
      ) {
        companyExpenses = round2(companyExpenses + debit - credit);
      } else if (
        accountHead === "RCM Expense Account" ||
        accountHead === "RCM Account"
      ) {
        rcmExpense = round2(rcmExpense + debit - credit);
      } else if (
        accountHead === "Developer Payout Account" ||
        accountHead === "Developer Expense Account"
      ) {
        developerPayoutExpense = round2(
          developerPayoutExpense + debit - credit,
        );
      } else if (
        accountHead === "Direct Expense Account" ||
        accountHead === "Direct Expenses Account"
      ) {
        directExpenses = round2(directExpenses + debit - credit);
      } else if (
        accountHead === "Indirect Expense Account" ||
        accountHead === "Indirect Expenses Account"
      ) {
        indirectExpenses = round2(indirectExpenses + debit - credit);
      } else if (accountHead === "Interest Income") {
        otherIncome = round2(otherIncome + credit - debit);
      } else if (accountHead === "FD Early Closure Penalty") {
        fdPenaltyExpense = round2(fdPenaltyExpense + debit - credit);
      }

      // === GST TRACKING ===
      else if (
        accountHead === "GST Output CGST" ||
        accountHead === "GST Output SGST" ||
        accountHead === "GST Output IGST"
      ) {
        gstOutputTotal = round2(gstOutputTotal + credit - debit);
      } else if (
        accountHead === "GST Input CGST" ||
        accountHead === "GST Input SGST" ||
        accountHead === "GST Input IGST"
      ) {
        gstInputTotal = round2(gstInputTotal + debit - credit);
      } else if (accountHead === "Cash Account") {
        cashDebit = round2(cashDebit + debit);
        cashCredit = round2(cashCredit + credit);
      } else if (accountHead === "Bank Account") {
        bankDebit = round2(bankDebit + debit);
        bankCredit = round2(bankCredit + credit);
      } else if (accountHead === "Owner Investment Account") {
        ownerInvestmentDebit = round2(ownerInvestmentDebit + debit);
        ownerInvestmentCredit = round2(ownerInvestmentCredit + credit);
      } else if (accountHead === "Owner Withdrawal Account") {
        ownerWithdrawalDebit = round2(ownerWithdrawalDebit + debit);
        ownerWithdrawalCredit = round2(ownerWithdrawalCredit + credit);
      }

      // === INVENTORY / STOCK ===
      else if (
        accountHead === "Inventory Account" ||
        accountHead === "Stock Account" ||
        accountHead === "Closing Stock Account"
      ) {
        // Debit to inventory = increase, Credit = decrease
        closingStock = round2(closingStock + debit - credit);
      }
    }
  }

  // Final rounding
  salesRevenue = round2(salesRevenue);
  serviceRevenue = round2(serviceRevenue);
  otherIncome = round2(otherIncome);
  discountReceived = round2(discountReceived);

  purchaseExpense = round2(purchaseExpense);
  companyExpenses = round2(companyExpenses);
  rcmExpense = round2(rcmExpense);
  developerPayoutExpense = round2(developerPayoutExpense);
  directExpenses = round2(directExpenses);
  indirectExpenses = round2(indirectExpenses);
  fdPenaltyExpense = round2(fdPenaltyExpense);

  gstOutputTotal = round2(gstOutputTotal);
  gstInputTotal = round2(gstInputTotal);
  closingStock = round2(closingStock);
  cashDebit = round2(cashDebit);
  cashCredit = round2(cashCredit);
  bankDebit = round2(bankDebit);
  bankCredit = round2(bankCredit);
  ownerInvestmentDebit = round2(ownerInvestmentDebit);
  ownerInvestmentCredit = round2(ownerInvestmentCredit);
  ownerWithdrawalDebit = round2(ownerWithdrawalDebit);
  ownerWithdrawalCredit = round2(ownerWithdrawalCredit);

  // Calculate totals
  const totalRevenue = round2(
    salesRevenue + serviceRevenue + otherIncome + discountReceived,
  );

  const totalExpenses = round2(
    purchaseExpense +
      companyExpenses +
      rcmExpense +
      developerPayoutExpense +
      directExpenses +
      indirectExpenses +
      fdPenaltyExpense,
  );

  // Cost of Goods Sold (COGS) calculation
  // COGS = Opening Stock + Purchases - Closing Stock
  const cogs = round2(openingStock + purchaseExpense - closingStock);

  // Gross Profit = Total Revenue - COGS
  const grossProfit = round2(totalRevenue - cogs);

  // Net Profit = Gross Profit - Other Expenses
  const otherExpensesTotal = round2(
    companyExpenses +
      rcmExpense +
      developerPayoutExpense +
      directExpenses +
      indirectExpenses,
  );

  const netProfit = round2(grossProfit - otherExpensesTotal);

  // Net GST position
  const netGst = round2(gstOutputTotal - gstInputTotal);
  const openingCash = round2(openingBalances.openingCash || 0);
  const openingBank = round2(openingBalances.openingBank || 0);
  const openingGstInput = round2(openingBalances.openingGstInput || 0);

  const closingCash = round2(openingCash + cashDebit - cashCredit);
  const closingBank = round2(openingBank + bankDebit - bankCredit);

  const gstNetWithOpeningItc = round2(
    openingGstInput + gstInputTotal - gstOutputTotal,
  );
  const gstItcAvailable = gstNetWithOpeningItc > 0 ? gstNetWithOpeningItc : 0;
  const gstPayable = gstNetWithOpeningItc < 0 ? Math.abs(gstNetWithOpeningItc) : 0;

  const ownerInvestmentNet = round2(ownerInvestmentCredit - ownerInvestmentDebit);
  const ownerWithdrawalNet = round2(ownerWithdrawalDebit - ownerWithdrawalCredit);
  const closingOwnerEquity = round2(
    (openingBalances.openingCapital || 0) +
      ownerInvestmentNet +
      netProfit -
      ownerWithdrawalNet,
  );

  return {
    income: {
      salesRevenue,
      serviceRevenue,
      otherIncome,
      discountReceived,
      totalRevenue,
    },
    expenses: {
      purchaseExpense,
      companyExpenses,
      rcmExpense,
      developerPayoutExpense,
      directExpenses,
      indirectExpenses,
      fdPenaltyExpense,
      totalExpenses,
    },
    costOfGoodsSold: {
      openingStock,
      purchases: purchaseExpense,
      closingStock,
      cogs,
    },
    summary: {
      grossProfit,
      otherExpensesTotal,
      netProfit,
      gstOutputTotal,
      gstInputTotal,
      netGst,
    },
    position: {
      openingCash,
      openingBank,
      closingCash,
      closingBank,
      cashDebit,
      cashCredit,
      bankDebit,
      bankCredit,
      openingGstInput,
      gstInputTotal,
      gstOutputTotal,
      gstNetWithOpeningItc,
      gstItcAvailable,
      gstPayable,
      ownerInvestmentNet,
      ownerWithdrawalNet,
      closingOwnerEquity,
      openingCapital: round2(openingBalances.openingCapital || 0),
      openingStock,
      closingStock,
    },
    accountingMeta: {
      method: "transaction_based_accrual",
      revenueRecognition: "credit_minus_debit_on_revenue_accounts",
      expenseRecognition: "debit_minus_credit_on_expense_accounts",
      cogsFormula: "openingStock + purchases - closingStock",
      grossProfitFormula: "totalRevenue - cogs",
      netProfitFormula: "grossProfit - otherExpensesTotal",
      note: "Profit & Loss is calculated from transaction journal entries. Cash/bank, GST ITC/payable, and owner equity are returned separately in position for a Tally-style reconciliation view.",
    },
  };
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin, event);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const transactionsCollection = db.collection("transactions");

    if (event.httpMethod !== "GET") {
      return createResponse(405, { error: "Method not allowed" }, origin, event);
    }

    const params = event.queryStringParameters || {};
    const { financialYear = "ALL" } = params;

    const query = { isDeleted: { $ne: true } };

    if (financialYear !== "ALL") {
      query.financialYear = financialYear;
    }

    const transactions = await transactionsCollection.find(query).toArray();
    const normalizedTransactions = transactions.map(
      normalizeTransactionSnapshot,
    );
    const openingBalances = await getOpeningBalances(db, financialYear);
    const result = calculateProfitLossFromTransactions(
      normalizedTransactions,
      openingBalances,
    );

    return createResponse(200, result, origin, event);
  } catch (error) {
    console.error("Profit & Loss Summary API Error:", error);
    return createResponse(500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin, event);
  }
}