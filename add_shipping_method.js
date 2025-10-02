const mongoose = require('mongoose');
require('dotenv').config();
const express = require('express');
const path = require('path');
const { ShippingMethod } = require('./models/Products.js');

const app = express();
app.use('/public', express.static(path.join(__dirname, 'public')));

// Connect to DB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/esycles')
  .then(async () => {
    console.log("✅ DB connected");

    await ShippingMethod.create({ name: "standard", description: "Delivered in 5-7 days", cost: 5 , user:"6873eebded0e0539c64702e6"});
    await ShippingMethod.create({ name: "express", description: "Delivered in 2-3 days", cost: 12, user:"6873eebded0e0539c64702e6"});
    await ShippingMethod.create({ name: "overnight", description: "Delivered by next day", cost: 20, user:"6873eebded0e0539c64702e6" });

    console.log("🚀 Shipping methods added!");
    process.exit(0);
  })
  .catch(err => console.error("❌ DB connection error:", err));
