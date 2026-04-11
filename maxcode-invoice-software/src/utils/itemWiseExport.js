import XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const toNumber = (value) => {
  const num = Number.parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
};

const round2 = (value) => Number(toNumber(value).toFixed(2));

const getValueByKey = (source, keyOrKeys) => {
  if (!source || !keyOrKeys) return "";

  if (Array.isArray(keyOrKeys)) {
    for (const key of keyOrKeys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return "";
  }

  return source?.[keyOrKeys] ?? "";
};

const formatDate = (dateString) => {
  if (!dateString) return "";

  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (error) {
    return dateString;
  }
};

const distributeByAmount = (itemAmounts, targetTotal) => {
  if (!itemAmounts.length) return [];

  const subtotal = round2(itemAmounts.reduce((sum, amount) => sum + amount, 0));
  if (subtotal <= 0) {
    const each = round2(targetTotal / itemAmounts.length);
    let assigned = 0;

    return itemAmounts.map((_, index) => {
      if (index === itemAmounts.length - 1) {
        return round2(targetTotal - assigned);
      }
      assigned = round2(assigned + each);
      return each;
    });
  }

  let assigned = 0;
  return itemAmounts.map((amount, index) => {
    if (index === itemAmounts.length - 1) {
      return round2(targetTotal - assigned);
    }

    const share = round2((amount / subtotal) * targetTotal);
    assigned = round2(assigned + share);
    return share;
  });
};

const buildItemWiseRows = ({
  records,
  invoiceNumberKey,
  partyNameKey,
  partyLabel,
  dateKey = "invoiceDate",
  partyDetails = {},
}) => {
  const rows = [];

  let grandAmount = 0;
  let grandTax = 0;
  let grandTotalAmount = 0;
  let serial = 1;

  (records || []).forEach((record) => {
    const items = Array.isArray(record?.items) ? record.items : [];
    if (!items.length) return;

    const itemAmounts = items.map((item) =>
      round2(
        toNumber(item.amount || toNumber(item.qty) * toNumber(item.price)),
      ),
    );

    const invoiceAmount = round2(
      toNumber(
        record?.taxData?.subtotal || itemAmounts.reduce((a, b) => a + b, 0),
      ),
    );

    const taxPercent = round2(toNumber(record?.taxData?.taxPercentage || 0));
    const invoiceCgst = round2(toNumber(record?.taxData?.cgst || 0));
    const invoiceSgst = round2(toNumber(record?.taxData?.sgst || 0));
    const invoiceIgst = round2(toNumber(record?.taxData?.igst || 0));
    const invoiceRounding = round2(toNumber(record?.roundingAmount || 0));
    const invoiceTotalAmount = round2(
      toNumber(
        record?.taxData?.totalAmount ||
          invoiceAmount +
            invoiceCgst +
            invoiceSgst +
            invoiceIgst +
            invoiceRounding,
      ),
    );

    const distributedCgst = distributeByAmount(itemAmounts, invoiceCgst);
    const distributedSgst = distributeByAmount(itemAmounts, invoiceSgst);
    const distributedIgst = distributeByAmount(itemAmounts, invoiceIgst);
    const distributedRounding = distributeByAmount(
      itemAmounts,
      invoiceRounding,
    );

    let invoiceItemsAmount = 0;
    let invoiceItemsCgst = 0;
    let invoiceItemsSgst = 0;
    let invoiceItemsIgst = 0;
    let invoiceItemsTax = 0;
    let invoiceItemsRounding = 0;
    let invoiceItemsTotal = 0;

    items.forEach((item, itemIndex) => {
      const qty = round2(toNumber(item.qty));
      const price = round2(toNumber(item.price));
      const amount = itemAmounts[itemIndex] || 0;
      const cgst = distributedCgst[itemIndex] || 0;
      const sgst = distributedSgst[itemIndex] || 0;
      const igst = distributedIgst[itemIndex] || 0;
      const rounding = distributedRounding[itemIndex] || 0;
      const tax = round2(cgst + sgst + igst);
      const totalAmount = round2(amount + tax + rounding);

      invoiceItemsAmount = round2(invoiceItemsAmount + amount);
      invoiceItemsCgst = round2(invoiceItemsCgst + cgst);
      invoiceItemsSgst = round2(invoiceItemsSgst + sgst);
      invoiceItemsIgst = round2(invoiceItemsIgst + igst);
      invoiceItemsTax = round2(invoiceItemsTax + tax);
      invoiceItemsRounding = round2(invoiceItemsRounding + rounding);
      invoiceItemsTotal = round2(invoiceItemsTotal + totalAmount);

      rows.push({
        sn: serial,
        invoiceNumber: getValueByKey(record, invoiceNumberKey),
        invoiceDate: formatDate(record?.[dateKey]),
        partyName: getValueByKey(record, partyNameKey),
        gstin: getValueByKey(record, partyDetails.gstinKey),
        address: getValueByKey(record, partyDetails.addressKey),
        placeOfSupply: getValueByKey(record, partyDetails.placeOfSupplyKey),
        itemName: item?.itemName || "",
        hsnCode: item?.hsnCode || "",
        quantity: qty,
        price,
        amount,
        taxPercent,
        cgst,
        sgst,
        igst,
        tax,
        rounding,
        totalAmount,
        rowType: "item",
        partyLabel,
      });

      serial += 1;
    });

    rows.push({
      sn: "",
      invoiceNumber: "",
      invoiceDate: "",
      partyName: "",
      gstin: "",
      address: "",
      placeOfSupply: "",
      itemName: "TOTAL",
      hsnCode: "",
      quantity: "",
      price: "",
      amount: round2(invoiceItemsAmount),
      taxPercent: "",
      cgst: round2(invoiceItemsCgst),
      sgst: round2(invoiceItemsSgst),
      igst: round2(invoiceItemsIgst),
      tax: round2(invoiceItemsTax),
      rounding: round2(invoiceItemsRounding),
      totalAmount: round2(invoiceItemsTotal),
      rowType: "total",
      partyLabel,
    });

    grandAmount = round2(grandAmount + invoiceItemsAmount);
    grandTax = round2(grandTax + invoiceItemsTax);
    grandTotalAmount = round2(grandTotalAmount + invoiceItemsTotal);
  });

  rows.push({
    sn: "",
    invoiceNumber: "",
    invoiceDate: "",
    partyName: "",
    gstin: "",
    address: "",
    placeOfSupply: "",
    itemName: "GRAND TOTAL",
    hsnCode: "",
    quantity: "",
    price: "",
    amount: round2(grandAmount),
    taxPercent: "",
    cgst: "",
    sgst: "",
    igst: "",
    tax: round2(grandTax),
    rounding: "",
    totalAmount: round2(grandTotalAmount),
    rowType: "grand-total",
    partyLabel,
  });

  return rows;
};

export const exportItemWiseExcel = ({
  records,
  exportFileName,
  sheetName,
  reportTitle,
  invoiceNumberKey,
  partyNameKey,
  partyLabel,
  dateKey,
  partyDetails,
}) => {
  const rows = buildItemWiseRows({
    records,
    invoiceNumberKey,
    partyNameKey,
    partyLabel,
    dateKey,
    partyDetails,
  });

  const exportRows = rows.map((row) => ({
    "S.No": row.sn,
    "Invoice No": row.invoiceNumber,
    "Invoice Date": row.invoiceDate,
    [row.partyLabel]: row.partyName,
    GSTIN: row.gstin,
    Address: row.address,
    "Place Of Supply": row.placeOfSupply,
    "Item Name": row.itemName,
    "HSN/SAC": row.hsnCode,
    Quantity: row.quantity,
    Price: row.price,
    Amount: row.amount,
    "Tax %": row.taxPercent,
    CGST: row.cgst,
    SGST: row.sgst,
    IGST: row.igst,
    Tax: row.tax,
    "Round Off": row.rounding,
    "Total Amount": row.totalAmount,
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);

  ws["!cols"] = [
    { width: 8 },
    { width: 16 },
    { width: 14 },
    { width: 24 },
    { width: 24 },
    { width: 30 },
    { width: 16 },
    { width: 24 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
  ];

  ws["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const headerCellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[headerCellRef]) continue;

    ws[headerCellRef].s = {
      fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } },
      font: { bold: true, color: { rgb: "000000" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };
  }

  for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
    const row = rows[rowIndex - 1];
    const isSummaryRow =
      row.rowType === "total" || row.rowType === "grand-total";

    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: col });
      if (!ws[cellRef]) continue;

      ws[cellRef].s = {
        font: { bold: isSummaryRow },
        alignment: {
          vertical: "center",
          horizontal: col >= 9 ? "right" : "left",
        },
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Item Wise");

  XLSX.writeFile(
    wb,
    `${exportFileName}_${reportTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
};

export const exportItemWisePDF = ({
  records,
  exportFileName,
  reportTitle,
  invoiceNumberKey,
  partyNameKey,
  partyLabel,
  dateKey,
  partyDetails,
}) => {
  const rows = buildItemWiseRows({
    records,
    invoiceNumberKey,
    partyNameKey,
    partyLabel,
    dateKey,
    partyDetails,
  });

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const formattedDateTime = new Date().toLocaleString();

  // Helper to clean up whitespace (but allow wrapping)
  const cleanText = (val) => {
    if (!val) return "";
    return String(val)
      .replace(/\r?\n|\r/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const tableBody = rows.map((row) => [
    row.sn,
    cleanText(row.invoiceNumber),
    cleanText(row.invoiceDate),
    cleanText(row.partyName),
    cleanText(row.gstin),
    cleanText(row.address),
    cleanText(row.placeOfSupply),
    cleanText(row.itemName),
    cleanText(row.hsnCode),
    row.quantity,
    row.price,
    row.amount,
    row.taxPercent,
    row.cgst,
    row.sgst,
    row.igst,
    row.tax,
    row.rounding,
    row.totalAmount,
  ]);

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const titleText = `${reportTitle} - Item Wise`;
  const titleWidth =
    (doc.getStringUnitWidth(titleText) * doc.internal.getFontSize()) /
    doc.internal.scaleFactor;
  doc.text(titleText, (pageWidth - titleWidth) / 2, 12);

  // Yellow separator line
  doc.setDrawColor(255, 204, 0);
  doc.setLineWidth(1);
  doc.line(8, 17, pageWidth - 8, 17);

  // Date/Time and Total Records (unique invoice count)
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated on: ${formattedDateTime}`, 8, 25);
  // Count unique invoice numbers (ignore empty)
  const uniqueInvoices = Array.from(
    new Set(rows.map((r) => r.invoiceNumber).filter(Boolean)),
  );
  doc.text(`Total Invoices: ${uniqueInvoices.length}`, pageWidth - 8, 25, {
    align: "right",
  });

  const tableHead = [
    "S.No",
    "Invoice No",
    "Invoice Date",
    partyLabel,
    "GSTIN",
    "Address",
    "Place Of Supply",
    "Item Name",
    "HSN/SAC",
    "Qty",
    "Price",
    "Amount",
    "Tax %",
    "CGST",
    "SGST",
    "IGST",
    "Tax",
    "Round Off",
    "Total Amount",
  ];

  autoTable(doc, {
    head: [tableHead],
    body: tableBody,
    startY: 30,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      overflow: "linebreak",
      lineWidth: 0.1,
      lineColor: [200, 200, 200],
      textColor: [0, 0, 0],
      halign: "center",
      valign: "middle",
      minCellHeight: 7,
      cellWidth: "wrap",
    },
    headStyles: {
      fillColor: [255, 204, 0],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      valign: "middle",
      minCellHeight: 8,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center", minCellHeight: 7 }, // S.No
      1: { cellWidth: 22, halign: "center", minCellHeight: 7 }, // Invoice No
      2: { cellWidth: 20, halign: "center", minCellHeight: 7 }, // Invoice Date
      3: { cellWidth: 32, halign: "left", minCellHeight: 7 }, // Party Name
      4: { cellWidth: 26, halign: "center", minCellHeight: 7 }, // GSTIN
      5: { cellWidth: 36, halign: "left", minCellHeight: 7 }, // Address
      6: { cellWidth: 26, halign: "left", minCellHeight: 7 }, // Place Of Supply
      7: { cellWidth: 32, halign: "left", minCellHeight: 7 }, // Item Name
      8: { cellWidth: 18, halign: "center", minCellHeight: 7 }, // HSN/SAC
      9: { cellWidth: 13, halign: "right", minCellHeight: 7 }, // Qty
      10: { cellWidth: 16, halign: "right", minCellHeight: 7 }, // Price
      11: { cellWidth: 18, halign: "right", minCellHeight: 7 }, // Amount
      12: { cellWidth: 13, halign: "center", minCellHeight: 7 }, // Tax %
      13: { cellWidth: 15, halign: "right", minCellHeight: 7 }, // CGST
      14: { cellWidth: 15, halign: "right", minCellHeight: 7 }, // SGST
      15: { cellWidth: 15, halign: "right", minCellHeight: 7 }, // IGST
      16: { cellWidth: 15, halign: "right", minCellHeight: 7 }, // Tax
      17: { cellWidth: 15, halign: "right", minCellHeight: 7 }, // Round Off
      18: { cellWidth: 20, halign: "right", minCellHeight: 7 }, // Total Amount
    },
    didParseCell: (hookData) => {
      if (hookData.section !== "body") return;

      const row = rows[hookData.row.index];
      if (row?.rowType === "total" || row?.rowType === "grand-total") {
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.fillColor = [255, 250, 205];
      }
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    margin: {
      top: 30,
      bottom: 8,
      left: 8,
      right: 8,
    },
    tableWidth: "auto",
    horizontalPageBreak: true,
    theme: "grid",
    showHead: "everyPage",
    pageBreak: "auto",
  });

  doc.save(
    `${exportFileName}_Item_Wise_${new Date().toISOString().slice(0, 10)}.pdf`,
  );
};
