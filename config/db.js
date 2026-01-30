const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

const caPath = path.join(
  path.resolve(__dirname, "../"),
  "isrgrootx1.pem"
);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { ca: fs.readFileSync(caPath) },
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
