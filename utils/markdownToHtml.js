const { marked } = require("marked");

function markdownToHtml(markdown) {
  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background-color: #f4f4f4; }
        </style>
      </head>
      <body>
        ${marked(markdown)}
      </body>
    </html>
  `;
}

module.exports = { markdownToHtml };
