const express = require("express");
const router = express.Router();
const { createQuotationHandler,approveQuotationHandler,
       generateAIQuotationHandler,sendQuotationHandler,
       generateQuotationPDFHandler,sendQuotationFirebaseHandler} = require("../controllers/quotationController");

router.post("/", createQuotationHandler);
router.post("/:quotationId/approve", approveQuotationHandler);
router.post("/:quotationId/generate-ai", generateAIQuotationHandler);
router.post("/:quotationId/send", sendQuotationHandler);
router.post("/:quotationId/sendFirebase", sendQuotationFirebaseHandler);
router.post("/:quotationId/generate-pdf", generateQuotationPDFHandler);

module.exports = router;
