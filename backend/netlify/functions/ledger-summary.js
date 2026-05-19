// D:\MaxCode Accounting Software\backend\netlify\functions\ledger-summary.js
import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { normalizeTransactionSnapshot } from "./utils/transactions.js";

const toNumber = (value) => {
  const num = parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
};

const round2 = (v) => Math.round(toNumber(v) * 100) / 100;

const getDateOnly = (value) => {
  if (!value) return null;
  const parseDate = (rawValue) => {
    const direct = new Date(rawValue);
    if (!Number.isNaN(direct.getTime())) return direct;

    const raw = String(rawValue || "").trim();
    const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dashMatch) {
      const parsed = new Date(
        Number(dashMatch[3]),
        Number(dashMatch[2]) - 1,
        Number(dashMatch[1]),
      );
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const parsed = new Date(
        Number(slashMatch[3]),
        Number(slashMatch[2]) - 1,
        Number(slashMatch[1]),
      );
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  };

  const date = parseDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const getOpeningBalances = async (db, financialYear) => {
  const yearsCollection = db.collection("financialYears");
  const yearRecord = await yearsCollection.findOne({
    financialYear,
    isDeleted: { $ne: true },
  });

  if (!yearRecord) return {};

  // Sum all ITC components: individual CGST/SGST/IGST fields + combined openingItc field
  const openingGstInput =
    toNumber(yearRecord.openingCgstItc || yearRecord.openingItcCgst || 0) +
    toNumber(yearRecord.openingSgstItc || yearRecord.openingItcSgst || 0) +
    toNumber(yearRecord.openingIgstItc || yearRecord.openingItcIgst || 0) +
    toNumber(yearRecord.openingItc || yearRecord.openingGstInput || 0);

  return {
    openingGstInput,
    cashOpening: toNumber(yearRecord.openingCash || 0),
    bankOpening: toNumber(yearRecord.openingBank || 0),
    inventory: toNumber(
      yearRecord.openingInventory || yearRecord.closingStock || 0,
    ),
    openingCapital: toNumber(
      yearRecord.openingCapital ||
        yearRecord.capitalAmount ||
        yearRecord.ownerCapital ||
        0,
    ),
  };
};

const calculateLedgerFromTransactions = (
  transactions,
  openingBalances = {},
) => {
  const summary = {
    cashDebit: 0,
    cashCredit: 0,
    bankDebit: 0,
    bankCredit: 0,
    salesCredit: 0,
    salesReturnDebit: 0,
    purchaseDebit: 0,
    companyExpenseDebit: 0,
    projectPayoutDebit: 0,
    gstOutputCredit: 0,
    gstOutputDebit: 0,
    gstInputDebit: 0,
    sundryDebtorsDebit: 0,
    sundryCreditorsCredit: 0,
    customerAdvanceLiabilityCredit: 0,
    creditNotePayableCredit: 0,
    customerOverpaymentCredit: 0,
    ownerFundingCredit: 0,
    ownerInvestmentDebit: 0,
    ownerInvestmentCredit: 0,
  };

  // Process all transactions
  for (const transaction of transactions) {
    for (const line of transaction.lines || []) {
      const accountHead = line.accountHead;
      const debit = toNumber(line.debit);
      const credit = toNumber(line.credit);

      if (accountHead === "Cash Account") {
        summary.cashDebit += debit;
        summary.cashCredit += credit;
      } else if (accountHead === "Bank Account") {
        summary.bankDebit += debit;
        summary.bankCredit += credit;
      } else if (accountHead === "Sales Account") {
        summary.salesCredit += credit;
      } else if (accountHead === "Sales Return / Adjustment Account") {
        summary.salesReturnDebit += debit;
      } else if (accountHead === "Purchase Account") {
        summary.purchaseDebit += debit;
      } else if (accountHead === "Company Expense Account") {
        summary.companyExpenseDebit += debit;
      } else if (accountHead === "Project Cost Account") {
        summary.projectPayoutDebit += debit;
      } else if (
        accountHead === "GST Output CGST" ||
        accountHead === "GST Output SGST" ||
        accountHead === "GST Output IGST"
      ) {
        summary.gstOutputCredit += credit;
        summary.gstOutputDebit += debit;
      } else if (
        accountHead === "GST Input CGST" ||
        accountHead === "GST Input SGST" ||
        accountHead === "GST Input IGST"
      ) {
        summary.gstInputDebit += debit;
      } else if (accountHead === "Sundry Debtors Account") {
        summary.sundryDebtorsDebit += debit - credit;
      } else if (accountHead === "Sundry Creditors Account") {
        summary.sundryCreditorsCredit += credit;
      } else if (accountHead === "Advance from Customer") {
        summary.customerAdvanceLiabilityCredit += credit;
      } else if (accountHead === "Credit Note Payable") {
        summary.creditNotePayableCredit += credit;
      } else if (accountHead === "Owner Funding Account") {
        summary.ownerFundingCredit += credit;
      } else if (accountHead === "Owner Investment Account") {
        summary.ownerInvestmentDebit += debit;
        summary.ownerInvestmentCredit += credit;
      }
    }
  }

  // Add opening GST input balance (rounded at source)
  summary.gstInputDebit += toNumber(openingBalances.openingGstInput || 0);

  // Handle customer overpayment
  if (summary.sundryDebtorsDebit < 0) {
    summary.customerOverpaymentCredit = Math.abs(summary.sundryDebtorsDebit);
    summary.sundryDebtorsDebit = 0;
  }

  // Round all accumulators once at the end to 2dp
  for (const key of Object.keys(summary)) {
    summary[key] = round2(summary[key]);
  }

  // Calculate totals
  const totalDebit = round2(
    summary.cashDebit +
      summary.bankDebit +
      summary.purchaseDebit +
      summary.companyExpenseDebit +
      summary.projectPayoutDebit +
      summary.salesReturnDebit +
      summary.gstOutputDebit +
      summary.gstInputDebit +
        summary.sundryDebtorsDebit +
        summary.ownerInvestmentDebit,
  );

  const totalCredit = round2(
    summary.cashCredit +
      summary.bankCredit +
      summary.salesCredit +
      summary.gstOutputCredit +
      summary.creditNotePayableCredit +
      summary.sundryCreditorsCredit +
      summary.customerOverpaymentCredit +
      summary.ownerFundingCredit +
        summary.ownerInvestmentCredit +
      summary.customerAdvanceLiabilityCredit,
  );

  // Calculate net GST after considering output reversals (e.g. credit notes).
  const netGstOutput = round2(summary.gstOutputCredit - summary.gstOutputDebit);
  const netGstDebit = round2(Math.max(summary.gstInputDebit - netGstOutput, 0));
  const netGstCredit = round2(
    Math.max(netGstOutput - summary.gstInputDebit, 0),
  );
  const netGstBalance = netGstDebit > 0 ? netGstDebit : -netGstCredit;
  const netGstType = netGstDebit > 0 ? "Dr" : "Cr";

  // Calculate bank closing
  const bankClosing = round2(summary.bankDebit - summary.bankCredit);
  const bankClosingType = bankClosing >= 0 ? "Dr" : "Cr";
  const cashClosing = round2(summary.cashDebit - summary.cashCredit);

  return {
    totalDebit,
    totalCredit,
    cashClosing: round2(Math.abs(cashClosing)),
    bankClosing: round2(Math.abs(bankClosing)),
    bankClosingType,
    gstNet: round2(Math.abs(netGstBalance)),
    gstNetType: netGstType,
    ledgerRows: [
      {
        sn: 1,
        accountName: "Cash Account",
        debit: summary.cashDebit,
        credit: summary.cashCredit,
        balance: cashClosing,
        balanceType: cashClosing >= 0 ? "Dr" : "Cr",
        notes: "Cash receipt from sales and cash payment in purchase/RCM",
      },
      {
        sn: 2,
        accountName: "Bank Account",
        debit: summary.bankDebit,
        credit: summary.bankCredit,
        balance: bankClosing,
        balanceType: bankClosingType,
        notes: "Bank/UPI/Card/Cheque receipt and payment",
      },
      {
        sn: 3,
        accountName: "Sales Account",
        debit: 0,
        credit: summary.salesCredit,
        balance: round2(-summary.salesCredit),
        balanceType: "Cr",
        notes: "Sales taxable value credited (Debit Notes increase sales)",
      },
      {
        sn: 4,
        accountName: "Sales Return / Adjustment Account",
        debit: summary.salesReturnDebit,
        credit: 0,
        balance: summary.salesReturnDebit,
        balanceType: "Dr",
        notes: "Credit Notes posted as sales return/adjustment debit",
      },
      {
        sn: 5,
        accountName: "Purchase Account",
        debit: summary.purchaseDebit,
        credit: 0,
        balance: summary.purchaseDebit,
        balanceType: "Dr",
        notes: "Purchase and RCM taxable value debited",
      },
      {
        sn: 6,
        accountName: "Company Expense Account",
        debit: summary.companyExpenseDebit,
        credit: 0,
        balance: summary.companyExpenseDebit,
        balanceType: "Dr",
        notes: "No-GST or bill-less business expenses debited",
      },
      {
        sn: 7,
        accountName: "Project Cost Account",
        debit: summary.projectPayoutDebit,
        credit: 0,
        balance: summary.projectPayoutDebit,
        balanceType: "Dr",
        notes: "Developer and third-party project payouts from Project Details",
      },
      {
        sn: 8,
        accountName: "GST Output Account",
        debit: summary.gstOutputDebit,
        credit: summary.gstOutputCredit,
        balance: round2(
          Math.abs(summary.gstOutputCredit - summary.gstOutputDebit),
        ),
        balanceType:
          summary.gstOutputCredit >= summary.gstOutputDebit ? "Cr" : "Dr",
        notes:
          "Credit: sales/debit-note/RCM output GST; Debit: credit-note GST reversal",
      },
      {
        sn: 9,
        accountName: "GST Input Account",
        debit: summary.gstInputDebit,
        credit: 0,
        balance: summary.gstInputDebit,
        balanceType: "Dr",
        notes: "Opening ITC + Purchase ITC tax + RCM tax reclaimable",
      },
      {
        sn: 10,
        accountName: "Sundry Debtors Account",
        debit: round2(Math.max(summary.sundryDebtorsDebit, 0)),
        credit: 0,
        balance: round2(Math.max(summary.sundryDebtorsDebit, 0)),
        balanceType: summary.sundryDebtorsDebit > 0 ? "Dr" : "Cr",
        notes:
          "Net receivable after payments and Credit/Debit Note adjustments",
      },
      {
        sn: 11,
        accountName: "Advance from Customer (Customer Credit)",
        debit: 0,
        credit: summary.customerAdvanceLiabilityCredit,
        balance: summary.customerAdvanceLiabilityCredit,
        balanceType: "Cr",
        notes: "Only unapplied advance receipts (liability)",
      },
      {
        sn: 12,
        accountName: "Credit Note / Customer Refund Payable",
        debit: 0,
        credit: summary.creditNotePayableCredit,
        balance: summary.creditNotePayableCredit,
        balanceType: "Cr",
        notes:
          "Separate liability for issued credit notes refundable/adjustable against future invoices",
      },
      {
        sn: 13,
        accountName: "Customer Credit Balance (Overpayment)",
        debit: 0,
        credit: summary.customerOverpaymentCredit,
        balance: summary.customerOverpaymentCredit,
        balanceType: "Cr",
        notes:
          "Customer overpayment liability kept separate from advance and credit notes",
      },
      {
        sn: 14,
        accountName: "Sundry Creditors Account",
        debit: 0,
        credit: summary.sundryCreditorsCredit,
        balance: summary.sundryCreditorsCredit,
        balanceType: "Cr",
        notes: "Purchase/RCM invoices not yet fully paid",
      },
      {
        sn: 15,
        accountName: "Owner Funding Account",
        debit: 0,
        credit: summary.ownerFundingCredit,
        balance: summary.ownerFundingCredit,
        balanceType: "Cr",
        notes: "Purchases/RCM/payouts paid from owner personal account",
      },
      {
        sn: 16,
        accountName: "Owner Investment Account",
        debit: summary.ownerInvestmentDebit,
        credit: summary.ownerInvestmentCredit,
        balance: round2(summary.ownerInvestmentCredit - summary.ownerInvestmentDebit),
        balanceType:
          summary.ownerInvestmentCredit >= summary.ownerInvestmentDebit ? "Cr" : "Dr",
        notes:
          "Owner capital transferred to business bank/cash; debits represent owner withdrawals",
      },
      {
        sn: 17,
        accountName: "GST Payable/(Receivable)",
        debit: netGstDebit,
        credit: netGstCredit,
        balance: round2(Math.abs(netGstBalance)),
        balanceType: netGstType,
        notes: "Net GST position after input set-off",
      },
    ],
  };
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const transactionsCollection = db.collection("transactions");

    if (event.httpMethod !== "GET") {
      return createResponse(405, { error: "Method not allowed" }, origin);
    }

    const params = event.queryStringParameters || {};
    const { financialYear = "ALL" } = params;

    // Build query for transactions
    const query = { isDeleted: { $ne: true } };

    if (financialYear !== "ALL") {
      query.financialYear = financialYear;
    }

    // Get all transactions
    const transactions = await transactionsCollection.find(query).toArray();
    const normalizedTransactions = transactions.map(
      normalizeTransactionSnapshot,
    );

    // Get opening balances for the financial year
    const openingBalances = await getOpeningBalances(db, financialYear);

    // Calculate ledger summary
    const result = calculateLedgerFromTransactions(
      normalizedTransactions,
      openingBalances,
    );

    return createResponse(200, result, origin);
  } catch (error) {
    console.error("Ledger Summary API Error:", error);
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
