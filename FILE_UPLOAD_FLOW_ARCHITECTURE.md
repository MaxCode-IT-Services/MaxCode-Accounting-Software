# File Upload Architecture - Complete Flow Documentation

## Overview

File upload flow har ek management page (Quotation, Project, RCM, Company Expense, Purchase) mein **same pattern** follow karta hai. Cloudflare R2 pe files store hoti hain aur URLs database mein save hote hain.

---

## 🔄 Complete Upload Flow

### **Step 1: Frontend - User Selects File in Create Form**

Jab user create form mein file select karta hai:

```jsx
// CreateQutation.jsx, CreateCompanyExpense.jsx, etc.

const [selectedQutationFile, setSelectedQutationFile] = useState(null);

// File selection handler
const handleFileChange = (e) => {
  setSelectedQutationFile(e.target.files[0]);
};

// Base64 conversion function (available in all create forms)
const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
```

**Key Point**: File को browser me **BASE64 format** mein convert kar diya jata hai ta ze Base64 string HTTP request ke through send ho sake.

---

### **Step 2: Frontend - Form Submission (Client-Side Processing)**

Jab user "Submit" button click karta hai:

```jsx
const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    setSubmitting(true);

    // Form data ke saath file data add karo
    const payload = {
      ...formData,
      financialYear: selectedFinancialYear,
      qutationTotalAmount: Number(formData.qutationTotalAmount || 0),
    };

    // Agar file select hua hai toh upload data tayyar karo
    const qutationUpload = selectedQutationFile
      ? {
          fileName: selectedQutationFile.name, // Original file name
          fileType: selectedQutationFile.type || "application/octet-stream",
          fileDataBase64: await toBase64(selectedQutationFile), // Base64 encoded content
        }
      : null;

    // File data ko payload mein include karo
    if (qutationUpload) {
      payload.qutationUpload = qutationUpload;
    }

    // API request bhejo
    if (editingRecord && !editingRecord.isViewMode) {
      await apiPut(API_ENDPOINTS.QUTATIONS.UPDATE(qutationId), payload);
    } else {
      await apiPost(API_ENDPOINTS.QUTATIONS.CREATE, payload);
    }

    showSuccess("Qutation created successfully!");
    onSubmit(payload);
  } catch (error) {
    showError(error.response?.data?.message || "Failed to save qutation");
  } finally {
    setSubmitting(false);
  }
};
```

**Payload Structure Example:**

```json
{
  "qutationNumber": "QUT001",
  "clientName": "ABC Corp",
  "projectName": "Website Project",
  "qutationDate": "2026-03-23",
  "qutationGoogleDriveLink": "https://drive.google.com/...",
  "qutationUpload": {
    "fileName": "proposal.pdf",
    "fileType": "application/pdf",
    "fileDataBase64": "JVBERi0xLjQKJeLjz9MNCjE4IDAgb2JqCjw8L0..."
  }
  // ... other fields
}
```

---

### **Step 3: Backend - File Upload to Cloudflare**

Jab backend API endpoint ko payload milta hai:

**File: `backend/netlify/functions/qutations.js`**

```javascript
// POST /qutations (Create) - Line 700-750
if (qutationData?.qutationUpload?.fileDataBase64) {
  // Step 1: Cloudflare settings fetch karo database se
  const cloudflareSettings = await getCloudflareSettingsFromDatabase(db);

  if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
    return createResponse(
      400,
      {
        error:
          "Cloudflare settings missing. Configure Cloudflare before uploading qutation document.",
      },
      origin,
    );
  }

  // Step 2: File data extract karo
  const qutationUpload = qutationData.qutationUpload;

  // Step 3: File extension nikalo
  const extension = getExtensionFromUpload(
    qutationUpload.fileName,
    qutationUpload.fileType,
  );

  // Step 4: Unique filename banao (qutation number ke basis par)
  const fileName = `${sanitizeIdentifier(qutationData.qutationNumber)}.${extension}`;

  // Step 5: Cloudflare mein object path define karo
  // Format: {Module}/{FinancialYear}/{fileName}
  const objectPath = `Qutation/${getFinancialYearLabel(qutationData.qutationDate)}/${fileName}`;

  // Step 6: Base64 string ko Buffer mein convert karo
  const fileBuffer = Buffer.from(
    String(qutationUpload.fileDataBase64 || ""),
    "base64",
  );

  if (!fileBuffer.length) {
    return createResponse(
      400,
      {
        error: "Invalid qutation file data",
      },
      origin,
    );
  }

  // Step 7: Cloudflare R2 pe upload karo
  const uploadResult = await uploadToCloudflareStore({
    storeUrl: cloudflareSettings.storeUrl, // R2 bucket URL
    publicDomain: cloudflareSettings.publicDomain, // Custom domain for public access
    password: cloudflareSettings.password, // API password
    objectPath, // Path in Cloudflare
    mimeType: qutationUpload.fileType || "application/octet-stream",
    fileBuffer, // Actual file content
  });

  // Step 8: Response mein milne wale URLs ko database fields mein save karo
  qutationData.qutationFileURL = uploadResult.fileUrl; // Public accessible URL ✅
  qutationData.qutationFilePath = uploadResult.filePath; // Cloudflare object path
  qutationData.qutationFileName = fileName; // Saved filename
  qutationData.qutationFileType =
    qutationUpload.fileType || "application/octet-stream";
}

// Step 9: qutationUpload field ko remove kar do (file data ab database mein store na ho)
delete qutationData.qutationUpload;

// Step 10: Document ko database mein insert/update karo saath mein URL fields
const result = await qutationsCollection.insertOne({
  ...qutationData,
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

**Cloudflare Upload Process (Helper Function):**

```javascript
// backend/netlify/functions/files.js - Line 754
const uploadToCloudflareStore = async ({
  storeUrl,
  publicDomain,
  password,
  objectPath,
  mimeType,
  fileBuffer,
}) => {
  // PUT request Cloudflare R2 API ko bhejo
  const putUrl = `${storeUrl}/${objectPath}`;

  const putResponse = await fetch(putUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      Authorization: `Bearer ${password}`,
    },
    body: fileBuffer, // Actual file bytes
  });

  if (putResponse.ok) {
    // Cloudflare se public URL milta hai
    const responseUrl = publicDomain ? `${publicDomain}/${objectPath}` : putUrl;

    return {
      fileUrl: responseUrl, // ✅ Ye URL database mein save hoga
      filePath: objectPath, // ✅ Ye path database mein save hoga
    };
  }

  throw new Error(`Cloudflare upload failed: ${putResponse.status}`);
};
```

---

### **Step 4: Database - Fields Population**

Jab CreateQutation form submit hota hai, backend mein yeh fields **automatically populate** ho jate hain:

```javascript
// Database Document (MongoDB)
{
  _id: ObjectId("..."),
  qutationNumber: "QUT001",
  clientName: "ABC Corp",
  projectName: "Website Project",
  qutationDate: "2026-03-23",
  qutationGoogleDriveLink: "https://drive.google.com/...",

  // ✅ File upload ke baad yeh fields populate hote hain:
  qutationFileURL: "https://img.maxcodehub.com/Qutation/2025-2026/QUT001.pdf",  // Public URL
  qutationFilePath: "Qutation/2025-2026/QUT001.pdf",                           // Cloudflare path
  qutationFileName: "QUT001.pdf",                                              // Filename
  qutationFileType: "application/pdf",                                         // MIME type

  // Note: qutationUpload field **delete** ho gaya hai

  createdAt: ISODate("2026-03-23T10:30:00Z"),
  updatedAt: ISODate("2026-03-23T10:30:00Z")
}
```

---

### **Step 5: Management Page - Display & Link Handling**

Jab QutationManagement page data fetch karta hai:

**File: `src/Pages/QutationManagement.jsx` - Line 280-295**

```jsx
// API se data fetch hone ke baad mapping karo
const mappedData = qutationsData.map((qutation) => {
  // URL fields ko mapping name dedo (for display purposes)
  const qutationFileLink = qutation.qutationFileURL || "";

  return {
    ...qutation,
    id: qutation._id || qutation.id,
    qutationFileLink, // ✅ Is field ko table column mein use karenge
    qutationGoogleDriveLink: qutation.qutationGoogleDriveLink,
    // ... other mapped fields
  };
});

setRecords(mappedData);
```

**File: `src/Pages/QutationManagement.jsx` - Line 470-530**

```jsx
// Table column definition kar do
const columns = [
  // ... other columns ...

  {
    key: "qutationFile",
    label: "Qutation File",
    width: 120,
    disableSort: true,
    disableFilter: true,
    render: (_, record) =>
      record?.qutationFileLink ? (
        <button
          type="button"
          className="btn btn-sm btn-outline-success"
          onClick={(event) => {
            event.stopPropagation();
            // ✅ Cloudflare URL ko directly browser mein kholo
            window.open(
              record.qutationFileLink, // https://img.maxcodehub.com/Qutation/2025-2026/QUT001.pdf
              "_blank",
              "noopener,noreferrer",
            );
          }}
          title="Open uploaded qutation file"
        >
          <i className="fas fa-file"></i>
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          title="No uploaded qutation file"
          disabled
        >
          <i className="fas fa-file"></i>
        </button>
      ),
  },

  {
    key: "qutationLink",
    label: "Qutation Link",
    width: 120,
    disableSort: true,
    disableFilter: true,
    render: (_, record) =>
      record?.qutationGoogleDriveLink ? (
        <button
          type="button"
          className="btn btn-sm btn-outline-info"
          onClick={(event) => {
            event.stopPropagation();
            window.open(
              record.qutationGoogleDriveLink, // Google Drive link
              "_blank",
              "noopener,noreferrer",
            );
          }}
          title="Open Google Drive link"
        >
          <i className="fab fa-google-drive"></i>
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          title="No Google Drive link"
          disabled
        >
          <i className="fab fa-google-drive"></i>
        </button>
      ),
  },
];
```

---

## 📋 Field Mapping Across All Pages

### **1. Quotation Management**

| Create Form Field       | Upload Field   | Database Field          | Display Field           | Table Column    |
| ----------------------- | -------------- | ----------------------- | ----------------------- | --------------- |
| selectedQutationFile    | qutationUpload | qutationFileURL         | qutationFileLink        | "Qutation File" |
| qutationGoogleDriveLink | -              | qutationGoogleDriveLink | qutationGoogleDriveLink | "Qutation Link" |

### **2. Project Management**

| Create Form Field     | Upload Field           | Database Field          | Display Field            | Table Column     |
| --------------------- | ---------------------- | ----------------------- | ------------------------ | ---------------- |
| selectedProjectFile\* | projectAgreementUpload | projectAgreementFileURL | projectAgreementFileLink | "Agreement File" |
| -                     | -                      | projectAgreementUrlLink | projectAgreementUrlLink  | "Agreement Link" |

\*Note: Check CreateProject.jsx for exact field name

### **3. RCM Management**

| Create Form Field | Upload Field | Database Field | Display Field | Table Column |
| ----------------- | ------------ | -------------- | ------------- | ------------ |
| selectedRcmFile   | rcmUpload    | rcmFileURL     | rcmFileLink   | "RCM File"   |
| invoiceURL        | -            | rcmUrlLink     | rcmUrlLink    | "RCM Link"   |

### **4. Company Expense Management**

| Create Form Field   | Upload Field  | Database Field | Display Field   | Table Column   |
| ------------------- | ------------- | -------------- | --------------- | -------------- |
| selectedExpenseFile | expenseUpload | expenseFileURL | expenseFileLink | "Expense File" |
| expenseURL          | -             | expenseUrlLink | expenseUrlLink  | "Expense Link" |

### **5. Purchase Management**

| Create Form Field      | Upload Field  | Database Field    | Display Field     | Table Column   |
| ---------------------- | ------------- | ----------------- | ----------------- | -------------- |
| selectedPurchaseFile\* | invoiceUpload | invoiceFileURL    | invoiceFileLink   | "Invoice File" |
| -                      | -             | invoiceManualLink | invoiceManualLink | "Invoice Link" |

\*Note: Check CreatePurchase.jsx for exact field name

---

## 🔐 Cloudflare Configuration

Uploads work karne ke liye Settings se **Cloudflare settings configure** honi chahiye:

**Components/SettingsTabs/CloudflareTab.jsx**

```jsx
cloudflareSettings: {
  storeUrl: "https://mycloudflarebucket.r2.wasabisys.com",  // R2 bucket URL
  publicDomain: "https://img.maxcodehub.com",               // Custom domain for public access
  password: "your-api-password",                             // API authentication
  defaultFolder: "general,documents,invoices",               // Default folders
}
```

**Upload Path Pattern**:

```
Qutation/        → Module name
  2025-2026/     → Financial year
    QUT001.pdf   → Sanitized record identifier + extension
```

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. FRONTEND - Create Form                                   │
│    User uploads file → toBase64() → selectedQutationFile    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. FRONTEND - Form Submission                               │
│    payload = {                                              │
│      ...formData,                                           │
│      qutationUpload: {                                      │
│        fileName, fileType, fileDataBase64                   │
│      }                                                      │
│    }                                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. BACKEND - File Processing                                │
│    ✓ Fetch Cloudflare settings                             │
│    ✓ Convert Base64 → Buffer                               │
│    ✓ Calculate object path                                 │
│    ✓ Upload to Cloudflare R2                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. DATABASE - Save URL Fields                               │
│    qutationFileURL = "https://img.maxcodehub.com/..."      │
│    qutationFilePath = "Qutation/2025-2026/QUT001.pdf"     │
│    qutationFileName = "QUT001.pdf"                         │
│    qutationFileType = "application/pdf"                    │
│    [qutationUpload field DELETE]                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. MANAGEMENT PAGE - Display                                │
│    Fetch records → Map qutationFileURL to qutationFileLink │
│    Show file button → Click → window.open(fileUrl)         │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ Key Points to Remember

### **File Upload Happens Here**:

1. **Frontend**: `selectedFile` state mein file select hota hai (`toBase64()` se convert)
2. **Submission**: `qutationUpload` object mein payload ke saath bhejta hai
3. **Backend**: Base64 → Buffer → Cloudflare R2 upload
4. **Database**: `qutationFileURL` field mein public URL save hota hai

### **File Links Display Hote Hain**:

1. Fetch ke baad `qutationFileURL` ko `qutationFileLink` mein map karte hain
2. Table columns mein button render karte hain with URL
3. Button click karne pe `window.open(fileLink)` se download/preview

### **File Delete Hona**:

1. Backend mein `delete qutationData.qutationUpload;` se upload field remove hota hai
2. Sirf URL fields database mein reh jate hain
3. Backend function `deleteFromCloudflareStore()` use kar ke actual file delete kar sakte ho

---

## 🚀 Upload Flow Summary

| Step  | What Happens              | Where                      | Field Name                      |
| ----- | ------------------------- | -------------------------- | ------------------------------- |
| **1** | User selects file         | Frontend (Create form)     | `selectedQutationFile`          |
| **2** | File converted to Base64  | Frontend (handleSubmit)    | `qutationUpload.fileDataBase64` |
| **3** | File sent in payload      | HTTP POST/PUT              | `qutationUpload` object         |
| **4** | File extracted & uploaded | Backend API                | N/A (processed)                 |
| **5** | Public URL received       | Cloudflare R2              | `uploadResult.fileUrl`          |
| **6** | URL saved in database     | MongoDB                    | `qutationFileURL` ✅            |
| **7** | Data fetched & mapped     | Frontend (Management page) | `qutationFileLink`              |
| **8** | File opened on click      | Frontend (Table column)    | `window.open(qutationFileLink)` |

---

## 🔗 Important Files Reference

- **Frontend - Create Forms**: `src/Components/Create*.jsx`
- **Frontend - Base64 Conversion**: `toBase64()` function in each create form
- **Frontend - Management Pages**: `src/Pages/*Management.jsx`
- **Backend - Upload Logic**: `backend/netlify/functions/{module}.js` (line 700-900)
- **Backend - Cloudflare Helper**: `backend/netlify/functions/files.js` (uploadToCloudflareStore function)
- **Settings**: `src/Pages/Setting.jsx` (CloudflareTab component)
