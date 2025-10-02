const mongoose = require('mongoose');
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use('/public', express.static(path.join(__dirname, 'public')));

// Connect to DB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/esycles');

const { Brand, Color, Model, Product } = require('./models/Products');

async function seedProducts() {
  try {
    // ✅ Insert Brand
    const brand = await Brand.findOneAndUpdate(
      { name: "Tesla" },
      { description: "Electric vehicle brand" },
      { new: true, upsert: true }
    );

    // ✅ Insert Colors
    const colorData = [
      { name: "Red", hex: "#FF0000" },
      { name: "Black", hex: "#000000" },
      { name: "Blue", hex: "#0000FF" },
      { name: "White", hex: "#FFFFFF" },
      { name: "Silver", hex: "#C0C0C0" },
      { name: "Green", hex: "#00FF00" }
    ];

    const colors = [];
    for (const c of colorData) {
      const color = await Color.findOneAndUpdate(
        { name: c.name },
        { hex: c.hex },
        { new: true, upsert: true }
      );
      colors.push(color);
    }

    // ✅ Insert Models
    const modelData = [
      { name: "Model S", brand: brand._id },
      { name: "Model X", brand: brand._id },
      { name: "Model 3", brand: brand._id },
      { name: "Model Y", brand: brand._id },
      { name: "Cybertruck", brand: brand._id },
      { name: "Roadster", brand: brand._id }
    ];

    const models = [];
    for (const m of modelData) {
      const model = await Model.findOneAndUpdate(
        { name: m.name, brand: m.brand },
        m,
        { new: true, upsert: true }
      );
      models.push(model);
    }

    // ✅ Insert Products
    const productData = [
      {
        title: "Tesla Model S Plaid",
        description: "High performance electric bicycle with premium components",
        price: 4200,
        stock: 10,
        brand: brand._id,
        model: models[0]._id,
        color: colors[0]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
      {
        title: "Tesla Model X Adventure",
        description: "All-terrain electric bicycle with extended range battery",
        price: 3800,
        stock: 8,
        brand: brand._id,
        model: models[1]._id,
        color: colors[1]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
      {
        title: "Tesla Model X Adventure",
        description: "All-terrain electric bicycle with extended range battery",
        price: 3800,
        stock: 8,
        brand: brand._id,
        model: models[1]._id,
        color: colors[1]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
      {
        title: "Tesla Model X Adventure",
        description: "All-terrain electric bicycle with extended range battery",
        price: 3800,
        stock: 8,
        brand: brand._id,
        model: models[1]._id,
        color: colors[1]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
      {
        title: "Tesla Model X Adventure",
        description: "All-terrain electric bicycle with extended range battery",
        price: 3800,
        stock: 8,
        brand: brand._id,
        model: models[1]._id,
        color: colors[1]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
      {
        title: "Tesla Model X Adventure",
        description: "All-terrain electric bicycle with extended range battery",
        price: 3800,
        stock: 8,
        brand: brand._id,
        model: models[1]._id,
        color: colors[1]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
      {
        title: "Tesla Model X Adventure",
        description: "All-terrain electric bicycle with extended range battery",
        price: 3800,
        stock: 8,
        brand: brand._id,
        model: models[1]._id,
        color: colors[1]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
      {
        title: "Tesla Model X Adventure",
        description: "All-terrain electric bicycle with extended range battery",
        price: 3800,
        stock: 8,
        brand: brand._id,
        model: models[1]._id,
        color: colors[1]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
      {
        title: "Tesla Model X Adventure",
        description: "All-terrain electric bicycle with extended range battery",
        price: 3800,
        stock: 8,
        brand: brand._id,
        model: models[1]._id,
        color: colors[1]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
      {
        title: "Tesla Model X Adventure",
        description: "All-terrain electric bicycle with extended range battery",
        price: 3800,
        stock: 8,
        brand: brand._id,
        model: models[1]._id,
        color: colors[1]._id,
        seller: "6873eebded0e0539c64702e6",
        type: "BICYCLES",
        images: [
          "/public/uploads/2.jpeg",
          "/public/uploads/3.jpeg",
          "/public/uploads/4.jpeg",
          "/public/uploads/5.jpeg"
        ]
      },
    ];

    for (const p of productData) {
      await Product.findOneAndUpdate(
        { title: p.title },
        {
          ...p,
          old_price: p.price + 350,
          rating: 4.5,
          reviews_count: 40,
          MOQ: 5,
          installmentMonth: 16
        },
        { new: true, upsert: true }
      );
    }

    console.log("✅ Products seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding products:", error);
    process.exit(1);
  }
}

seedProducts();
