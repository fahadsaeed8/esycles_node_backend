const mongoose = require("mongoose");
require("dotenv").config();
const express = require("express");
const path = require("path");
const { Currency } = require("./models/Utils.js"); // 👈 Import Currency model

const app = express();
app.use("/public", express.static(path.join(__dirname, "public")));

// Currency data
const currencies = [
  { code: "USD", symbol: "$", name: "US Dollar", id: "cur_001" },
  { code: "EUR", symbol: "€", name: "Euro", id: "cur_002" },
  { code: "GBP", symbol: "£", name: "British Pound", id: "cur_003" },
  { code: "INR", symbol: "₹", name: "Indian Rupee", id: "cur_004" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", id: "cur_005" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", id: "cur_006" },
  { code: "CAD", symbol: "$", name: "Canadian Dollar", id: "cur_007" },
  { code: "AUD", symbol: "$", name: "Australian Dollar", id: "cur_008" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", id: "cur_009" },
  { code: "ZAR", symbol: "R", name: "South African Rand", id: "cur_010" },
];

// Connect to DB and insert currencies
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/esycles")
  .then(async () => {
    console.log("✅ DB connected");

    // Clear existing currencies to avoid duplicates
    await Currency.deleteMany({});
    console.log("🗑️ Old currencies removed");

    // Insert new currencies
    await Currency.insertMany(
      currencies.map((c) => ({
        name: c.name,
        code: c.code,
        symbol: c.symbol,
        is_active: true,
      }))
    );

    console.log("🚀 Currencies added!");
    process.exit(0);
  })
  .catch((err) => console.error("❌ DB connection error:", err));
