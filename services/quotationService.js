const db = require("../config/db");
const { calculatePricing } = require("./priceService");
const { generateQuotationAI } = require("./aiquotationService");
const { markdownToHtml } = require("../utils/markdownToHtml");
const { generateQuotationPDF } = require("../utils/pdfGenerator");
const { sendQuotationEmail } = require("./emailService");
const { getApprovedQuotationDataFirebase } = require("./firebaseService")

const { toWords } = require("number-to-words");

function amountInWords(amount) {
  return (
    "Rupees " +
    toWords(Math.round(amount)).replace(/,/g, "") +
    " Only"
  );
}

// function buildAIPayload(data) {

//   // 👉 Detect tax percent (safe if same slab, else use per-item display)
//   const sampleTaxRate = data.items[0]?.tax_rate || 0;
//   const cgstPercent = sampleTaxRate / 2;
//   const sgstPercent = sampleTaxRate / 2;

//   return {
//     quotationId: data.quotation.id,

//     // 🔹 Sender
//     sender: {
//       companyName: data.company.company_name,
//       address: data.company.address,
//       gstin: data.company.gstin,
//       email: data.company.email
//     },

//     // 🔹 Receiver
//     client: {
//       companyName: data.client.company_name,
//       address: data.client.address,
//       gstin: data.client.gstin,
//       email: data.client.email
//     },

//     // 🔹 Sales Manager
//     salesManager: {
//       name: data.quotation.sales_manager_name,
//       email: data.quotation.sales_manager_email
//     },

//     // 🔹 Line Items (WITH TAX %)
//     items: data.items.map(i => ({
//       name: i.name,
//       model: i.model,
//       description: i.description,
//       quantity: i.quantity,
//       unitPrice: i.unit_price,
//       standardDiscount: i.standard_discount || 0,
//       additionalDiscount: i.additional_discount || 0,

//       // 👇 tax percentage per product
//       cgstPercent: i.tax_rate / 2,
//       sgstPercent: i.tax_rate / 2,

//       // 👇 tax amount per product (already calculated & stored)
//       cgstAmount: i.cgst_amount,
//       sgstAmount: i.sgst_amount,

//       lineTotal: i.line_total
//     })),

//     // 🔹 Pricing Summary (WITH % + WORDS)
//     pricing: {
//       subtotal: data.quotation.subtotal,
//       cgst: data.quotation.cgst,
//       sgst: data.quotation.sgst,
//       cgstPercent,
//       sgstPercent,
//       total: data.quotation.total,
//       totalInWords: amountInWords(data.quotation.total)
//     },

//     validTill: data.quotation.valid_till,
//     currency: "INR"
//   };
// }

function buildAIPayload(data) {

  // console.log("AI Payload Source Data:", data.items);

  // 🔹 Take tax % from first item (assumes same slab)
  const cgstPercent = data.items[0]?.cgstPercent || 0;
  const sgstPercent = data.items[0]?.sgstPercent || 0;

  return {
    quotationId: data.quotation.id,

    /* -------------------------------
       🔹 SENDER
    -------------------------------- */
    sender: {
      companyName: data.company.company_name,
      address: data.company.address,
      gstin: data.company.gstin,
      email: data.company.email
    },

    /* -------------------------------
       🔹 CLIENT
    -------------------------------- */
    client: {
      companyName: data.client.company_name || "N/A",
      address: data.client.address,
      gstin: data.client.gstin,
      email: data.client.email
    },

    /* -------------------------------
       🔹 SALES MANAGER
    -------------------------------- */
    salesManager: {
      name: data.salesManager.name,
      email: data.salesManager.email
    },

    /* -------------------------------
       🔹 LINE ITEMS
    -------------------------------- */
    items: data.items.map(i => ({
      name: i.name,
      model: i.model || null,
      description: i.description || null,
      quantity: i.quantity,

      unitPrice: i.unitPrice,
      standardDiscount: i.standardDiscount || 0,
      additionalDiscount: i.additionalDiscount || 0,

      cgstPercent: i.cgstPercent,
      sgstPercent: i.sgstPercent,
      taxableAmount : i.taxableAmount,

      lineTotal: i.lineTotal
    })),

    /* -------------------------------
       🔹 PRICING SUMMARY
    -------------------------------- */
    pricing: {
      subtotal: data.quotation.subtotal,
      cgst: data.quotation.cgst,
      sgst: data.quotation.sgst,
      cgstPercent,
      sgstPercent,
      total: data.quotation.total,
      totalInWords: amountInWords(data.quotation.total)
    },

    validTill: data.quotation.valid_till,
    currency: "INR"
  };
}


async function createQuotation(data) {
  const { clientId, salesManagerId, items, validityDays } = data;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // Fetch product details
    const productIds = items.map(i => i.productId);
    const [products] = await conn.query(
      `SELECT id, base_price, tax_rate, model, description
   FROM products
   WHERE id IN (?) AND is_active = true`,
      [productIds]
    );


    if (products.length !== items.length) {
      throw new Error("Invalid or inactive product");
    }

    // Merge quantities
    const enrichedProducts = products.map(p => {
      const item = items.find(i => i.productId === p.id);

      return {
        ...p,
        quantity: item.quantity,
        standard_discount: item.standard_discount || 0,
        additional_discount: item.additional_discount || 0
      };
    });


    const pricing = calculatePricing(enrichedProducts);

    // Insert quotation
    const validTill = new Date();
    validTill.setDate(validTill.getDate() + validityDays);

    const [quotationResult] = await conn.query(
      `INSERT INTO quotations
   (client_id, sales_manager_id, status, subtotal, cgst, sgst, total, valid_till)
   VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
      [
        clientId,
        salesManagerId,
        pricing.subtotal,
        pricing.cgst,
        pricing.sgst,
        pricing.total,
        validTill
      ]
    );


    const quotationId = quotationResult.insertId;

    // Insert quotation items
    for (const p of enrichedProducts) {
      const grossLineTotal = p.base_price * p.quantity;

      const standardDiscount = p.standard_discount || 0;
      const additionalDiscount = p.additional_discount || 0;

      const netLineTotal =
        grossLineTotal - standardDiscount - additionalDiscount;

      await conn.query(
        `INSERT INTO quotation_items
     (quotation_id, product_id, model, description,
      quantity, unit_price, standard_discount, additional_discount, line_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId,
          p.id,
          p.model,
          p.description,
          p.quantity,
          p.base_price,
          standardDiscount,
          additionalDiscount,
          netLineTotal
        ]
      );
    }


    // Audit log
    await conn.query(
      `INSERT INTO quotation_audit
       (quotation_id, action, performed_by)
       VALUES (?, 'CREATED', ?)`,
      [quotationId, salesManagerId]
    );

    await conn.commit();

    return {
      quotationId,
      status: "DRAFT",
      total: pricing.total
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}


//approveQuotation Function
async function approveQuotation({ quotationId, salesManagerId }) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // Fetch quotation
    const [rows] = await conn.query(
      `SELECT status FROM quotations WHERE id = ?`,
      [quotationId]
    );

    if (rows.length === 0) {
      throw new Error("Quotation not found");
    }

    if (rows[0].status !== "DRAFT") {
      throw new Error("Only DRAFT quotations can be approved");
    }

    // Update status
    await conn.query(
      `UPDATE quotations
       SET status = 'APPROVED'
       WHERE id = ?`,
      [quotationId]
    );

    // Audit log
    await conn.query(
      `INSERT INTO quotation_audit
       (quotation_id, action, performed_by)
       VALUES (?, 'APPROVED', ?)`,
      [quotationId, salesManagerId]
    );

    await conn.commit();

    return {
      quotationId,
      status: "APPROVED"
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}


//Function to get the Approved Quotations
async function getApprovedQuotationData(quotationId) {
  const [quotationRows] = await db.query(
    `SELECT
        q.id,
        q.subtotal,
        q.cgst,
        q.sgst,
        q.total,
        q.valid_till,
        c.company_name,
        c.address,
        c.gstin,
        c.email,
        u.name AS sales_manager_name,
        u.email AS sales_manager_email
     FROM quotations q
     JOIN clients c ON q.client_id = c.id
     JOIN users u ON q.sales_manager_id = u.id
     WHERE q.id = ? AND q.status = 'APPROVED'`,
    [quotationId]
  );

  if (quotationRows.length === 0) {
    throw new Error("Quotation not approved or not found");
  }

  const [items] = await db.query(
    `SELECT
        p.name,
        p.model,
        p.description,
        p.tax_rate,
        qi.quantity,
        qi.unit_price,
        qi.standard_discount,
        qi.additional_discount,
        qi.line_total
     FROM quotation_items qi
     JOIN products p ON qi.product_id = p.id
     WHERE qi.quotation_id = ?`,
    [quotationId]
  );

  // 🔹 Derive CGST / SGST percentage from tax_rate
  const enrichedItems = items.map(item => ({
    ...item,
    cgstPercent: item.tax_rate / 2,
    sgstPercent: item.tax_rate / 2
  }));

  const [[company]] = await db.query(
    `SELECT company_name, address, gstin, email
     FROM company_profile
     LIMIT 1`
  );

  return {
    quotation: quotationRows[0],
    items: enrichedItems,
    client: quotationRows[0],
    company
  };
}


//Function to generate AI Quotation
async function generateAIQuotation(quotationId, salesManagerId) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const data = await getApprovedQuotationDataFirebase(quotationId);
    const aiPayload = buildAIPayload(data);

    // console.log(aiPayload);

    const aiResult = await generateQuotationAI(aiPayload);

    await db.query(
      `
  INSERT INTO firebase_ai_quotations
    (firebase_quotation_id, subject, body)
  VALUES (?, ?, ?)
  ON DUPLICATE KEY UPDATE
    subject = VALUES(subject),
    body = VALUES(body)
  `,
      [
        quotationId,           // Firebase ID (string)
        aiResult.subject,
        aiResult.body
      ]
    );



    // await conn.query(
    //   `INSERT INTO quotation_audit
    //    (quotation_id, action, performed_by)
    //    VALUES (?, 'AI_GENERATED', ?)`,
    //   [quotationId, salesManagerId]
    // );

    await conn.commit();

    return {
      quotationId,
      subject: aiResult.subject
    };
  } catch (err) {
    await conn.rollback();
    console.error("AI quotation generation failed:", err);
    throw err;
  }
  finally {
    conn.release();
  }
}

async function generateQuotationPDFOnly(quotationId) {
  // 1️⃣ Get AI-generated content from DB
  // const [[quotation]] = await db.query(
  //   `SELECT ai_generated_body
  //    FROM quotations
  //    WHERE id = ? AND status = 'APPROVED'`,
  //   [quotationId]
  // );

  // 1️⃣ Get AI-generated content from DB
  const [[quotation]] = await db.query(
    `SELECT body
     FROM firebase_ai_quotations
     WHERE firebase_quotation_id = ?`,
    [quotationId]
  );

  console.log(quotation);
  console.log(quotationId);


  if (!quotation || !quotation.body) {
    throw new Error("AI quotation not generated yet");
  }

  // 2️⃣ Markdown → HTML
  const html = markdownToHtml(quotation.body);

  // 3️⃣ HTML → PDF (saved to disk)
  const pdfPath = await generateQuotationPDF(html, quotationId);

  // 4️⃣ (Optional but recommended) Save PDF path in DB
  // await db.query(
  //   `UPDATE quotations
  //    SET pdf_path = ?
  //    WHERE id = ?`,
  //   [pdfPath, quotationId]
  // );

  return {
    quotationId,
    pdfPath
  };
}



//Function Send Quotation to client
async function sendQuotationToClient(quotationId, salesManagerId) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();


    const [[quotation]] = await conn.query(
      `SELECT q.id,
          q.ai_generated_subject,
          q.ai_generated_body,
          c.email AS client_email
   FROM quotations q
   JOIN clients c ON q.client_id = c.id
   WHERE q.id = ? AND q.status = 'APPROVED'`,
      [quotationId]
    );


    if (!quotation) {
      throw new Error("Quotation not ready to send");
    }

    const html = markdownToHtml(quotation.ai_generated_body);
    const pdfPath = await generateQuotationPDF(html, quotationId);

    await sendQuotationEmail({
      to: quotation.client_email,
      subject: quotation.ai_generated_subject,
      text: "Please find attached your quotation.",
      attachmentPath: pdfPath,
    });

    await conn.query(
      `UPDATE quotations SET status = 'SENT' WHERE id = ?`,
      [quotationId]
    );

    await conn.query(
      `INSERT INTO quotation_audit (quotation_id, action, performed_by)
       VALUES (?, 'SENT_TO_CLIENT', ?)`,
      [quotationId, salesManagerId]
    );

    await conn.commit();

    return { quotationId, status: "SENT" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const admin = require("firebase-admin");
const firestore = admin.firestore();

async function sendQuotationToClientFirebase(firebaseQuotationId, salesManagerId) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* ------------------------------------------------
       1️⃣ Fetch AI quotation from SQL (Firebase-based)
    ------------------------------------------------- */
    const [[aiQuotation]] = await conn.query(
      `
      SELECT
        firebase_quotation_id,
        subject,
        body
      FROM firebase_ai_quotations
      WHERE firebase_quotation_id = ?
      `,
      [firebaseQuotationId]
    );

    if (!aiQuotation) {
      throw new Error("AI quotation not found in SQL");
    }

    /* ------------------------------------------------
       2️⃣ Fetch quotation from Firebase
    ------------------------------------------------- */
    const quotationSnap = await firestore
      .collection("quotations")
      .doc(firebaseQuotationId)
      .get();

    if (!quotationSnap.exists) {
      throw new Error("Quotation not found in Firebase");
    }

    const quotationData = quotationSnap.data();

    if (!quotationData.clientId) {
      throw new Error("clientId missing in Firebase quotation");
    }

    /* ------------------------------------------------
       3️⃣ Fetch client email from Firebase (source of truth)
    ------------------------------------------------- */
    const clientSnap = await firestore
      .collection("clients")
      .doc(quotationData.clientId)
      .get();

    if (!clientSnap.exists) {
      throw new Error("Client not found in Firebase");
    }

    const clientData = clientSnap.data();
    const clientEmail = clientData.emailAddress;

    if (!clientEmail) {
      throw new Error("Client email missing in Firebase");
    }

    /* ------------------------------------------------
       4️⃣ Generate PDF from AI markdown
    ------------------------------------------------- */
    const html = markdownToHtml(aiQuotation.body);
    const pdfPath = await generateQuotationPDF(html, firebaseQuotationId);

    /* ------------------------------------------------
       5️⃣ Send quotation email
    ------------------------------------------------- */
    await sendQuotationEmail({
      to: clientEmail,
      subject: aiQuotation.subject,
      text: "Please find attached your quotation.",
      attachmentPath: pdfPath
    });

    /* ------------------------------------------------
       6️⃣ Audit log (SQL only)
    ------------------------------------------------- */
    // await conn.query(
    //   `
    //   INSERT INTO quotation_audit
    //     (firebase_quotation_id, action, performed_by)
    //   VALUES
    //     (?, 'SENT_TO_CLIENT', ?)
    //   `,
    //   [firebaseQuotationId, salesManagerId]
    // );

    await conn.commit();

    return {
      firebaseQuotationId,
      status: "SENT",
      sentTo: clientEmail
    };

  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  sendQuotationToClientFirebase
};


module.exports = {
  createQuotation, approveQuotation,
  generateAIQuotation, sendQuotationToClient,
  generateQuotationPDFOnly, sendQuotationEmail,
  sendQuotationToClientFirebase
};
