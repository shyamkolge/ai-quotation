const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = admin.firestore();


async function getApprovedQuotationDataFirebase(quotationId) {
  // 1️⃣ Fetch quotation
  const quotationSnap = await db
    .collection("quotations")
    .doc(quotationId)
    .get();

  if (!quotationSnap.exists) {
    throw new Error("Quotation not found");
  }

  const quotation = quotationSnap.data();

  if (!quotation.productId) throw new Error("productId missing");
  if (!quotation.pricing) throw new Error("pricing missing");

  // 2️⃣ Fetch related entities
  const [
    companySnap,
    clientSnap,
    managerSnap,
    productSnap
  ] = await Promise.all([
    db.collection("companies").doc(quotation.companyId).get(),
    db.collection("clients").doc(quotation.clientId).get(),
    db.collection("sales_managers").doc(quotation.salesManagerId).get(),
    db.collection("products").doc(quotation.productId).get()
  ]);

  if (!companySnap.exists) throw new Error("Company not found");
  if (!clientSnap.exists) throw new Error("Client not found");
  if (!managerSnap.exists) throw new Error("Sales manager not found");
  if (!productSnap.exists) throw new Error("Product not found");

  const company = companySnap.data();
  const client = clientSnap.data();
  const salesManager = managerSnap.data();
  const product = productSnap.data();

  /* ------------------------------------
     🔹 PRICING CALCULATION (CORRECT)
  ------------------------------------ */

  const unitPrice = quotation.pricing.baseAmount;           // 55,000
  const discountPercent = quotation.pricing.discountPercent || 0;

  const standardDiscountAmount =
    (unitPrice * discountPercent) / 100;                    // 2,750

  const taxableAmount =
    unitPrice - standardDiscountAmount;                     // 52,250

  const cgstPercent = quotation.pricing.cgstPercent || 0;   // 5
  const sgstPercent = quotation.pricing.sgstPercent || 0;   // 7

  const cgstAmount =
    (taxableAmount * cgstPercent) / 100;                    // 2,612.50

  const sgstAmount =
    (taxableAmount * sgstPercent) / 100;                    // 3,657.50

  const lineTotal =
    taxableAmount + cgstAmount + sgstAmount;                // 58,520

  /* ------------------------------------
     🔹 NORMALIZED ITEM (AI + PDF READY)
  ------------------------------------ */

  const items = [
    {
      name: product.title,
      model: product.size || null,
      description: product.description || null,
      quantity: 1,

      unitPrice: unitPrice,

      // ✅ SEND DISCOUNT AMOUNTS (₹)
      standardDiscount: Number(standardDiscountAmount.toFixed(2)),
      additionalDiscount: 0,

      taxableAmount: Number(taxableAmount.toFixed(2)),

      cgstPercent,
      sgstPercent,
      cgstAmount: Number(cgstAmount.toFixed(2)),
      sgstAmount: Number(sgstAmount.toFixed(2)),

      lineTotal: Number(lineTotal.toFixed(2))
    }
  ];

  /* ------------------------------------
     🔹 FINAL RESPONSE
  ------------------------------------ */

  return {
    quotation: {
      id: quotationId,
      subtotal: Number(taxableAmount.toFixed(2)),
      cgst: Number(cgstAmount.toFixed(2)),
      sgst: Number(sgstAmount.toFixed(2)),
      total: Number(lineTotal.toFixed(2)),
      valid_till: quotation.createdAt?.toDate?.() || quotation.createdAt
    },

    items,

    company: {
      company_name: company.companyName,
      address: company.address,
      gstin: company.companyTIN,
      email: company.contactEmail
    },

    client: {
      company_name: client.companyName || "N/A",
      address: `${client.street}, ${client.city}, ${client.state}`,
      gstin: client.vatIdentifier || null,
      email: client.emailAddress
    },

    salesManager: {
      name: salesManager.name,
      email: salesManager.email
    }
  };
}

module.exports = {
  getApprovedQuotationDataFirebase
};
