const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

async function generateQuotationPDF(htmlContent, quotationId) {
  try {
    // Ensure pdf directory exists
    const pdfDir = path.join(process.cwd(), "pdf");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    // Launch Puppeteer (Render-safe)
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
      ],
    });

    const page = await browser.newPage();

    // Set HTML content
    await page.setContent(htmlContent, {
      waitUntil: "networkidle0",
    });

    const filePath = path.join(
      pdfDir,
      `quotation_${quotationId}.pdf`
    );

    // Generate PDF
    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm",
      },
    });

    await browser.close();

    return filePath;
  } catch (error) {
    console.error("PDF Generation Error:", error);
    throw new Error("Failed to generate quotation PDF");
  }
}

module.exports = { generateQuotationPDF };
