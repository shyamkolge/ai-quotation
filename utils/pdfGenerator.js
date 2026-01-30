const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

async function generateQuotationPDF(htmlContent, quotationId) {
  // Ensure pdf directory exists
  const pdfDir = path.join(process.cwd(), "pdf");
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir);
  }

  const browser = await puppeteer.launch();
  
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const filePath = path.join(pdfDir, `quotation_${quotationId}.pdf`);

  await page.pdf({
    path: filePath,
    format: "A4",
    printBackground: true,
  });

  await browser.close();
  return filePath;
}

module.exports = { generateQuotationPDF };
