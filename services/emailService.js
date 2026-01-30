const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendQuotationEmail({ to, subject, text, attachmentPath }) {
  await transporter.sendMail({
    from: `"ERP System" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    attachments: [
      {
        filename: "Quotation.pdf",
        path: attachmentPath,
      },
    ],
  });
}

module.exports = { sendQuotationEmail };
