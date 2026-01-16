const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auths");
const utilsRoutes = require("./routes/utils");
const productRoutes = require("./routes/products");
const adsRoutes = require("./routes/ads");
const paymentCardRoutes = require("./routes/paymentCards");
const stripeRoutes = require("./routes/stripe");
const escrowRoutes = require("./routes/escrow");
const sellerRoutes = require("./routes/seller");
const stripeController = require("./controllers/stripeController");

const path = require("path");

const PORT = 5000;
dotenv.config();
const allowedOrigins = [
  "https://esycles.com/",
  "https://esycles.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "https://bdbb668c9ac4.ngrok-free.app",
  "https://user.esycles.com",
  "https://noreplyxyz.esycles.com",
  "https://admin.esycles.com",
  "https://vendor.esycles.com",
  "https://customer.esycles.com",
];

const app = express();

// Serve static files
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(
  cors({
    origin: allowedOrigins,
  })
);

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());

// API Routes
app.use("/api", authRoutes);
app.use("/api", utilsRoutes);
app.use("/api", productRoutes);
app.use("/api", adsRoutes);
app.use("/api", paymentCardRoutes);
app.use("/api", stripeRoutes);
app.use("/api", escrowRoutes);
app.use("/api", sellerRoutes);
// ✅ Serve index.html at "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Stripe webhook endpoint (use raw body for signature verification)
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  (req, res) => stripeController.webhook(req, res)
);

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
