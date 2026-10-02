// D:\MaxCode Accounting Software\backend\netlify\functions\balance-sheet-summary.js
import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { normalizeTransactionSnapshot } from "./utils/transactions.js";

const toNumber = (value) => {
  const num = parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
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

  const openingGstInput = round2(
    round2(
      toNumber(yearRecord.openingCgstItc || yearRecord.openingItcCgst || 0),
    ) +
      round2(
        toNumber(yearRecord.openingSgstItc || yearRecord.openingItcSgst || 0),
      ) +
      round2(
        toNumber(yearRecord.openingIgstItc || yearRecord.openingItcIgst || 0),
      ) +
      round2(
        toNumber(yearRecord.openingItc || yearRecord.openingGstInput || 0),
      ),
  );

  return {
    openingGstInput: openingGstInput,
    cashOpening: round2(toNumber(yearRecord.openingCash || 0)),
    bankOpening: round2(toNumber(yearRecord.openingBank || 0)),
    inventory: round2(
      toNumber(yearRecord.openingInventory || yearRecord.closingStock || 0),
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

const calculateBalanceSheetFromTransactions = (
  transactions,
  openingBalances = {},
) => {
  // Initialize with opening balances - round each
  let cashBalance = round2(openingBalances.cashOpening || 0);
  let bankBalance = round2(openingBalances.bankOpening || 0);
  let receivables = 0;
  let totalGstInput = round2(openingBalances.openingGstInput || 0);
  let totalGstOutput = 0;
  let payables = 0;
  let ownerFunding = 0;
  let ownerInvestment = 0;
  let ownerWithdrawal = 0;
  let customerAdvance = 0;
  let creditNotePayable = 0;
  let customerOverpayment = 0;
  let inventory = round2(openingBalances.inventory || 0);
  let fixedDepositAsset = 0;
  let tdsReceivable = 0;
  let ownerPersonalRefund = 0;

  // Process each transaction line
  for (const transaction of transactions) {
    for (const line of transaction.lines || []) {
      const accountHead = line.accountHead;
      // Round each debit/credit to 2 decimals
      const debit = round2(toNumber(line.debit));
      const credit = round2(toNumber(line.credit));

      if (accountHead === "Cash Account") {
        cashBalance = round2(cashBalance + debit - credit);
      } else if (accountHead === "Bank Account") {
        bankBalance = round2(bankBalance + debit - credit);
      } else if (accountHead === "Sundry Debtors Account") {
        receivables = round2(receivables + debit - credit);
      } else if (
        accountHead === "GST Input CGST" ||
        accountHead === "GST Input SGST" ||
        accountHead === "GST Input IGST"
      ) {
        totalGstInput = round2(totalGstInput + debit - credit);
      } else if (accountHead === "Sundry Creditors Account") {
        payables = round2(payables + credit - debit);
      } else if (
        accountHead === "GST Output CGST" ||
        accountHead === "GST Output SGST" ||
        accountHead === "GST Output IGST"
      ) {
        totalGstOutput = round2(totalGstOutput + credit - debit);
      } else if (accountHead === "Owner Funding Account") {
        ownerFunding = round2(ownerFunding + credit - debit);
      } else if (accountHead === "Owner Investment Account") {
        ownerInvestment = round2(ownerInvestment + credit - debit);
      } else if (accountHead === "Owner Withdrawal Account") {
        ownerWithdrawal = round2(ownerWithdrawal + debit - credit);
      } else if (accountHead === "Advance from Customer") {
        customerAdvance = round2(customerAdvance + credit - debit);
      } else if (accountHead === "Credit Note Payable") {
        creditNotePayable = round2(creditNotePayable + credit - debit);
      } else if (accountHead === "Fixed Deposit Asset") {
        fixedDepositAsset = round2(fixedDepositAsset + debit - credit);
      } else if (accountHead === "TDS Receivable") {
        tdsReceivable = round2(tdsReceivable + debit - credit);
      } else if (accountHead === "Owner Personal Account") {
        ownerPersonalRefund = round2(ownerPersonalRefund + debit - credit);
      }
    }
  }

  // Final rounding of all accumulators
  cashBalance = round2(cashBalance);
  bankBalance = round2(bankBalance);
  receivables = round2(receivables);
  totalGstInput = round2(totalGstInput);
  totalGstOutput = round2(totalGstOutput);
  payables = round2(payables);
  ownerFunding = round2(ownerFunding);
  ownerInvestment = round2(ownerInvestment);
  ownerWithdrawal = round2(ownerWithdrawal);
  customerAdvance = round2(customerAdvance);
  creditNotePayable = round2(creditNotePayable);
  inventory = round2(inventory);
  fixedDepositAsset = round2(fixedDepositAsset);

  // Handle overdraft (negative cash/bank)
  let overdraft = 0;
  if (cashBalance < 0) {
    overdraft = round2(Math.abs(cashBalance));
    cashBalance = 0;
  }
  if (bankBalance < 0) {
    overdraft = round2(overdraft + Math.abs(bankBalance));
    bankBalance = 0;
  }
  overdraft = round2(overdraft);

  tdsReceivable = round2(Math.max(tdsReceivable, 0));
  ownerPersonalRefund = round2(ownerPersonalRefund);

  // Handle customer overpayment
  if (receivables < 0) {
    customerOverpayment = round2(Math.abs(receivables));
    receivables = 0;
  }
  customerOverpayment = round2(customerOverpayment);

  // Calculate GST Receivable/Payable
  const netGst = round2(totalGstInput - totalGstOutput);
  let gstReceivable = 0;
  let gstPayable = 0;

  if (netGst > 0) {
    gstReceivable = round2(netGst);
  } else {
    gstPayable = round2(Math.abs(netGst));
  }

  const cashBankTotal = round2(cashBalance + bankBalance);
  const receivablesGstTotal = round2(receivables + gstReceivable);
  const totalAssets = round2(
    cashBankTotal + receivablesGstTotal + inventory + fixedDepositAsset + tdsReceivable + ownerPersonalRefund,
  );

  const payablesGstTotal = round2(payables + gstPayable);
  const overdraftFundingTotal = round2(overdraft + ownerFunding);
  const advanceCreditTotal = round2(customerAdvance + creditNotePayable);
  const totalLiabilities = round2(
    payablesGstTotal +
      overdraftFundingTotal +
      advanceCreditTotal +
      customerOverpayment,
  );

  const totalEquity = round2(totalAssets - totalLiabilities);
  const openingCapital = round2(openingBalances.openingCapital || 0);
  const retainedEarnings = round2(
    totalEquity - openingCapital - ownerInvestment + ownerWithdrawal,
  );

  // Final result with all values rounded to 2 decimals
  return {
    assets: {
      cashOpening: round2(openingBalances.cashOpening || 0),
      cash: cashBalance,
      bankOpening: round2(openingBalances.bankOpening || 0),
      bank: bankBalance,
      receivables: receivables,
      gstReceivable: gstReceivable,
      inventory: inventory,
      fixedDeposits: fixedDepositAsset,
      tdsReceivable: tdsReceivable,
      ownerPersonalRefund: ownerPersonalRefund > 0 ? ownerPersonalRefund : undefined,
    },
    liabilities: {
      payables: payables,
      gstPayable: gstPayable,
      overdraft: overdraft,
      ownerFunding: ownerFunding,
      customerAdvance: customerAdvance,
      creditNotePayable: creditNotePayable,
      customerOverpayment: customerOverpayment,
    },
    totalAssets: totalAssets,
    totalLiabilities: totalLiabilities,
    equity: totalEquity,
    openingCapital: openingCapital,
    ownerInvestment: ownerInvestment,
    ownerWithdrawal: ownerWithdrawal,
    retainedEarnings: retainedEarnings,
    accountingMeta: {
      equityMethod: "derived_from_balance_sheet",
      equityFormula: "totalAssets - totalLiabilities",
      retainedEarningsMethod: "derived_residual",
      retainedEarningsFormula:
        "equity - openingCapital - ownerInvestment + ownerWithdrawal",
      profitLossIntegrated: false,
      inventoryMethod: "opening_inventory_only",
      ownerFundingClassification: "liability_personal_payments",
      note: "Retained earnings shown here is a derived balancing figure. Owner withdrawals are treated separately from capital introduced.",
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
    const result = calculateBalanceSheetFromTransactions(
      normalizedTransactions,
      openingBalances,
    );

    return createResponse(200, result, origin, event);
  } catch (error) {
    console.error("Balance Sheet Summary API Error:", error);
    return createResponse(500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin, event);
  }
}
