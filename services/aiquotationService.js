const axios = require("axios");

async function generateQuotationAI(payload) {
  console.log(payload);
  const response = await axios.post(
    "https://ai-agent-erp.onrender.com/generate-quotation",
    payload
  );

  return response.data;
}

module.exports = { generateQuotationAI };
