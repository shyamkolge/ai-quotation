const { createQuotation,approveQuotation,
  generateAIQuotation,sendQuotationToClient, generateQuotationPDFOnly,
  sendQuotationToClientFirebase} = require("../services/quotationService");

  
async function createQuotationHandler(req, res) {
  try {
    const result = await createQuotation(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({
      error: err.message
    });
  }
}


async function approveQuotationHandler(req, res) {
  try {
    const { quotationId } = req.params;
    const { salesManagerId } = req.body;

    const result = await approveQuotation({
      quotationId,
      salesManagerId
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function generateAIQuotationHandler(req, res) {
  try {
    const { quotationId } = req.params;
    const { salesManagerId } = req.body;

    const result = await generateAIQuotation(quotationId, salesManagerId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function sendQuotationHandler(req, res) {
  try {
    const { quotationId } = req.params;
    const { salesManagerId } = req.body;

    const result = await sendQuotationToClient(
      quotationId,
      salesManagerId
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function sendQuotationFirebaseHandler(req, res) {
  try {
    const { quotationId } = req.params;
    const { salesManagerId } = req.body;

    const result = await sendQuotationToClientFirebase(
      quotationId,
      salesManagerId
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function generateQuotationPDFHandler(req, res) {
  try {
    const { quotationId } = req.params;

    
    const result = await generateQuotationPDFOnly(quotationId);

    
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}


module.exports = { createQuotationHandler,approveQuotationHandler,
                   generateAIQuotationHandler,sendQuotationHandler,
                  generateQuotationPDFHandler,sendQuotationFirebaseHandler};
