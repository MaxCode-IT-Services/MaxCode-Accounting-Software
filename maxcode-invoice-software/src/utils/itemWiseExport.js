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

const formatRoundingWithSign = (value) => {
  const num = toNumber(value);
  if (num === 0) return "0";
  return num > 0 ? `+${num.toFixed(2)}` : `${num.toFixed(2)}`;
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
  originalRefNoKey,
}) => {
  const rows = [];

  let grandAmount = 0;
  let grandTax = 0;
  let grandRounding = 0;
  let grandTotalAmount = 0;
  let invoiceSerial = 1;

  // Sort records in ascending order by invoice date and invoice number
  const sortedRecords = [...(records || [])].sort((a, b) => {
    const dateA = new Date(a?.[dateKey] || 0);
    const dateB = new Date(b?.[dateKey] || 0);
    if (dateA.getTime() !== dateB.getTime()) {
      return dateA.getTime() - dateB.getTime();
    }
    // If dates are same, sort by invoice number
    const invoiceA = String(getValueByKey(a, invoiceNumberKey) || "");
    const invoiceB = String(getValueByKey(b, invoiceNumberKey) || "");
    return invoiceA.localeCompare(invoiceB);
  });

  sortedRecords.forEach((record) => {
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
    const invoiceTotalTax = round2(invoiceCgst + invoiceSgst + invoiceIgst);
    
    // Calculate rounding as the difference between totalAmount and (amount + tax)
    const recordTotalAmount = round2(toNumber(record?.taxData?.totalAmount || 0));
    const calculatedTotal = round2(invoiceAmount + invoiceTotalTax);
    const invoiceRounding = round2(recordTotalAmount - calculatedTotal);
    
    const invoiceTotalAmount = recordTotalAmount;

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
        sn: itemIndex === 0 ? invoiceSerial : "",
        invoiceNumber: getValueByKey(record, invoiceNumberKey),
        invoiceDate: formatDate(record?.[dateKey]),
        originalRefNo: originalRefNoKey ? getValueByKey(record, originalRefNoKey) : undefined,
        partyName: getValueByKey(record, partyNameKey),
        businessName: record?.businessName || "",
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
        rounding: formatRoundingWithSign(rounding),
        totalAmount,
        rowType: "item",
        partyLabel,
      });
    });

    rows.push({
      sn: "",
      invoiceNumber: "",
      invoiceDate: "",
      originalRefNo: "",
      partyName: "",
      businessName: "",
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
      rounding: formatRoundingWithSign(invoiceItemsRounding),
      totalAmount: round2(invoiceItemsTotal),
      rowType: "total",
      partyLabel,
    });

    // Increment serial number for next invoice
    invoiceSerial += 1;

    grandAmount = round2(grandAmount + invoiceItemsAmount);
    grandTax = round2(grandTax + invoiceItemsTax);
    grandRounding = round2(grandRounding + invoiceItemsRounding);
    grandTotalAmount = round2(grandTotalAmount + invoiceItemsTotal);
  });

  rows.push({
    sn: "",
    invoiceNumber: "",
    invoiceDate: "",
    originalRefNo: "",
    partyName: "",
    businessName: "",
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
    rounding: formatRoundingWithSign(grandRounding),
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
  originalRefNoKey,
  invoiceNumberLabel,
  dateLabel,
  hideBusinessName,
}) => {
  const rows = buildItemWiseRows({
    records,
    invoiceNumberKey,
    partyNameKey,
    partyLabel,
    dateKey,
    partyDetails,
    originalRefNoKey,
  });

  const exportRows = rows.map((row) => {
    const mapped = {
      "S.No": row.sn,
      [invoiceNumberLabel || "Invoice No"]: row.invoiceNumber,
      [dateLabel || "Invoice Date"]: row.invoiceDate,
    };
    if (originalRefNoKey) {
      mapped["Supplier Invoice No"] = row.originalRefNo ?? "";
    }
    mapped[row.partyLabel] = row.partyName;
    if (!hideBusinessName) {
      mapped["Business Name"] = row.businessName;
    }
    mapped.GSTIN = row.gstin;
    mapped.Address = row.address;
    mapped["Place Of Supply"] = row.placeOfSupply;
    mapped["Item Name"] = row.itemName;
    mapped["HSN/SAC"] = row.hsnCode;
    mapped.Quantity = row.quantity;
    mapped.Price = row.price;
    mapped.Amount = row.amount;
    mapped["Tax %"] = row.taxPercent;
    mapped.CGST = row.cgst;
    mapped.SGST = row.sgst;
    mapped.IGST = row.igst;
    mapped.Tax = row.tax;
    mapped["Round Off"] = row.rounding;
    mapped["Total Amount"] = row.totalAmount;
    return mapped;
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);

  // Dynamic column widths based on actual columns
  const colCount = Object.keys(exportRows[0] || {}).length;
  const defaultWidths = [
    { width: 8 },   // S.No
    { width: 16 },  // Invoice No
    { width: 14 },  // Invoice Date
  ];
  if (originalRefNoKey) {
    defaultWidths.push({ width: 16 }); // Supplier Invoice No
  }
  defaultWidths.push(
    { width: 24 },  // Party Name
  );
  if (!hideBusinessName) {
    defaultWidths.push({ width: 26 }); // Business Name
  }
  defaultWidths.push(
    { width: 24 },  // GSTIN
    { width: 30 },  // Address
    { width: 16 },  // Place Of Supply
    { width: 24 },  // Item Name
    { width: 12 },  // HSN/SAC
    { width: 10 },  // Quantity
    { width: 12 },  // Price
    { width: 10 },  // Amount
    { width: 12 },  // Tax %
    { width: 12 },  // CGST
    { width: 12 },  // SGST
    { width: 14 },  // IGST
    { width: 12 },  // Tax
    { width: 12 },  // Round Off
    { width: 16 },  // Total Amount
  );

  ws["!cols"] = defaultWidths;

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
      fill: { patternType: "solid", fgColor: { rgb: "4CAF50" } },
      font: { bold: true, color: { rgb: "FFFFFF" } },
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
        fill: isSummaryRow
          ? { patternType: "solid", fgColor: { rgb: "C8E6C9" } }
          : undefined,
        border: {
          top: { style: "thin", color: { rgb: "CCCCCC" } },
          bottom: { style: "thin", color: { rgb: "CCCCCC" } },
          left: { style: "thin", color: { rgb: "CCCCCC" } },
          right: { style: "thin", color: { rgb: "CCCCCC" } },
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
  originalRefNoKey,
  invoiceNumberLabel,
  dateLabel,
  hideBusinessName,
}) => {
  const rows = buildItemWiseRows({
    records,
    invoiceNumberKey,
    partyNameKey,
    partyLabel,
    dateKey,
    partyDetails,
    originalRefNoKey,
  });

  // Check if single page PDF columns mode is enabled
  const singlePagePdfColumnsMode =
    String(localStorage.getItem("pdfExportSinglePageColumnsMode") || "")
      .toLowerCase() === "true";

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Format date-time as DD-MM-YYYY | HH:MM:SS AM/PM
  const formatDateTimeForPDF = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const hoursStr = String(hours).padStart(2, '0');
    return `${day}-${month}-${year} | ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  };
  
  const formattedDateTime = formatDateTimeForPDF(new Date());
  const tableLeftMargin = 8;
  const tableRightMargin = 8;
  const availableWidth = pageWidth - tableLeftMargin - tableRightMargin;

  // Helper to clean up whitespace (but allow wrapping)
  const cleanText = (val) => {
    if (!val) return "";
    return String(val)
      .replace(/\r?\n|\r/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const tableBody = rows.map((row) => {
    const cells = [
      row.sn,
      cleanText(row.invoiceNumber),
      cleanText(row.invoiceDate),
    ];
    if (originalRefNoKey) {
      cells.push(cleanText(row.originalRefNo));
    }
    cells.push(cleanText(row.partyName));
    if (!hideBusinessName) {
      cells.push(cleanText(row.businessName));
    }
    cells.push(
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
    );
    return cells;
  });

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const titleText = `${reportTitle} - Item Wise`;
  const titleWidth =
    (doc.getStringUnitWidth(titleText) * doc.internal.getFontSize()) /
    doc.internal.scaleFactor;
  doc.text(titleText, (pageWidth - titleWidth) / 2, 12);

  // Green separator line
  doc.setDrawColor(76, 175, 80);
  doc.setLineWidth(1);
  doc.line(8, 17, pageWidth - 8, 17);

  // Date/Time and Total Records (unique invoice count)
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated on: ${formattedDateTime}`, 8, 25);
  const uniqueInvoices = Array.from(
    new Set(rows.map((r) => r.invoiceNumber).filter(Boolean)),
  );
  doc.text(`Total Invoices: ${uniqueInvoices.length}`, pageWidth - 8, 25, {
    align: "right",
  });

  const tableHead = [
    "S.No",
    invoiceNumberLabel || "Invoice No",
    dateLabel || "Invoice Date",
    ...(originalRefNoKey ? ["Supplier Invoice No"] : []),
    partyLabel,
    ...(!hideBusinessName ? ["Business Name"] : []),
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

  let columnStyles;

  if (singlePagePdfColumnsMode) {
    // Dynamic column width calculation using measurement
    const cellPaddingLeftRight = 2;
    const horizontalPadding = cellPaddingLeftRight * 2;
    const widthSafetyFactor = 0.998;
    const PDF_WIDTH_MEASUREMENT_SAMPLE_SIZE = 100;

    const measurementRows =
      tableBody.length > PDF_WIDTH_MEASUREMENT_SAMPLE_SIZE
        ? tableBody.slice(0, PDF_WIDTH_MEASUREMENT_SAMPLE_SIZE)
        : tableBody;

    const measureColumnsAtFontSize = (fontSize) => {
      return tableHead.map((label, columnIndex) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fontSize + 0.6);
        const headerWidth = doc.getTextWidth(String(label || ""));

        const maxBodyWidth = measurementRows.reduce((maxWidth, row) => {
          const cellValue = String(row?.[columnIndex] ?? "");
          doc.setFont("helvetica", "normal");
          doc.setFontSize(fontSize);
          return Math.max(maxWidth, doc.getTextWidth(cellValue));
        }, 0);

        const preferredWidth =
          Math.max(headerWidth, maxBodyWidth) + horizontalPadding + 0.8;
        return Math.max(6, preferredWidth);
      });
    };

    const minFontSize = 1.8;
    const maxFontSize = 9.5;
    let computedFontSize = 8;
    let columnWidths = measureColumnsAtFontSize(computedFontSize);
    let totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const maxAllowedWidth = availableWidth * widthSafetyFactor;

    const totalAtMin = measureColumnsAtFontSize(minFontSize).reduce(
      (sum, width) => sum + width,
      0,
    );
    const totalAtMax = measureColumnsAtFontSize(maxFontSize).reduce(
      (sum, width) => sum + width,
      0,
    );

    if (totalAtMin >= maxAllowedWidth) {
      computedFontSize = minFontSize;
    } else if (totalAtMax <= maxAllowedWidth) {
      computedFontSize = maxFontSize;
    } else {
      let low = minFontSize;
      let high = maxFontSize;

      for (let i = 0; i < 22; i += 1) {
        const mid = (low + high) / 2;
        const midTotal = measureColumnsAtFontSize(mid).reduce(
          (sum, width) => sum + width,
          0,
        );

        if (midTotal <= maxAllowedWidth) {
          low = mid;
        } else {
          high = mid;
        }
      }

      computedFontSize = low;
    }

    columnWidths = measureColumnsAtFontSize(computedFontSize);
    totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);

    let guard = 0;
    while (
      totalWidth > maxAllowedWidth &&
      computedFontSize > minFontSize &&
      guard < 16
    ) {
      computedFontSize = Math.max(minFontSize, computedFontSize * 0.94);
      columnWidths = measureColumnsAtFontSize(computedFontSize);
      totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
      guard += 1;
    }

    const widthScale = totalWidth > 0 ? maxAllowedWidth / totalWidth : 1;

    columnStyles = columnWidths.reduce((styles, width, columnIndex) => {
      styles[columnIndex] = {
        cellWidth: Math.max(0.8, width * widthScale),
        halign:
          columnIndex === 0 ? "center" : columnIndex >= 9 ? "right" : "left",
        valign: "middle",
      };
      return styles;
    }, {});

    autoTable(doc, {
      head: [tableHead],
      body: tableBody,
      startY: 30,
      styles: {
        fontSize: computedFontSize,
        cellPadding: {
          top: 1.5,
          right: cellPaddingLeftRight,
          bottom: 1.5,
          left: cellPaddingLeftRight,
        },
        overflow: "visible",
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
        valign: "middle",
      },
      headStyles: {
        fillColor: [76, 175, 80],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: Math.max(computedFontSize + 0.4, 1.2),
        halign: "center",
        valign: "middle",
      },
      columnStyles,
      didParseCell: (hookData) => {
        if (hookData.section !== "body") return;

        hookData.cell.styles.overflow = "visible";

        const row = rows[hookData.row.index];
        if (row?.rowType === "total" || row?.rowType === "grand-total") {
          hookData.cell.styles.fontStyle = "bold";
          hookData.cell.styles.fillColor = [200, 230, 201];
        } else {
          hookData.cell.styles.fillColor =
            hookData.row.index % 2 === 0 ? [255, 255, 255] : [248, 250, 245];
        }
      },
      margin: {
        top: 30,
        bottom: 8,
        left: tableLeftMargin,
        right: tableRightMargin,
      },
      tableWidth: maxAllowedWidth,
      horizontalPageBreak: false,
      showHead: "everyPage",
      pageBreak: "auto",
      theme: "grid",
    });
  } else {
    // Original fixed column widths
    columnStyles = {
      0: { cellWidth: 10, halign: "center", minCellHeight: 7 },
      1: { cellWidth: 22, halign: "center", minCellHeight: 7 },
      2: { cellWidth: 20, halign: "center", minCellHeight: 7 },
      3: { cellWidth: 32, halign: "left", minCellHeight: 7 },
      4: { cellWidth: 26, halign: "center", minCellHeight: 7 },
      5: { cellWidth: 36, halign: "left", minCellHeight: 7 },
      6: { cellWidth: 26, halign: "left", minCellHeight: 7 },
      7: { cellWidth: 32, halign: "left", minCellHeight: 7 },
      8: { cellWidth: 18, halign: "center", minCellHeight: 7 },
      9: { cellWidth: 13, halign: "right", minCellHeight: 7 },
      10: { cellWidth: 16, halign: "right", minCellHeight: 7 },
      11: { cellWidth: 18, halign: "right", minCellHeight: 7 },
      12: { cellWidth: 13, halign: "center", minCellHeight: 7 },
      13: { cellWidth: 15, halign: "right", minCellHeight: 7 },
      14: { cellWidth: 15, halign: "right", minCellHeight: 7 },
      15: { cellWidth: 15, halign: "right", minCellHeight: 7 },
      16: { cellWidth: 15, halign: "right", minCellHeight: 7 },
      17: { cellWidth: 15, halign: "right", minCellHeight: 7 },
      18: { cellWidth: 20, halign: "right", minCellHeight: 7 },
    };

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
        fillColor: [76, 175, 80],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
        valign: "middle",
        minCellHeight: 8,
      },
      columnStyles,
      didParseCell: (hookData) => {
        if (hookData.section !== "body") return;

        const row = rows[hookData.row.index];
        if (row?.rowType === "total" || row?.rowType === "grand-total") {
          hookData.cell.styles.fontStyle = "bold";
          hookData.cell.styles.fillColor = [200, 230, 201];
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
  }

  doc.save(
    `${exportFileName}_Item_Wise_${new Date().toISOString().slice(0, 10)}.pdf`,
  );
};
