require("dotenv").config(); // Load .env file di awal

const midtransClient = require('midtrans-client');

// Validasi kunci Midtrans dari environment variables
if (!process.env.MIDTRANS_SERVER_KEY) {
  throw new Error("MIDTRANS_SERVER_KEY is required in environment variables");
}

if (!process.env.MIDTRANS_CLIENT_KEY) {
  throw new Error("MIDTRANS_CLIENT_KEY is required in environment variables");
}

// Inisialisasi Snap Midtrans
const midtrans = new midtransClient.Snap({
  isProduction: false, // Gunakan true jika di production
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

midtrans.httpClient.http_client.defaults.timeout = 10000;
module.exports = midtrans;
