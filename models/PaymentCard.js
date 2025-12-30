const mongoose = require("mongoose");

const paymentCardSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  stripe_payment_method_id: {
    type: String,
    required: true,
    unique: true,
  },
  stripe_customer_id: {
    type: String,
    required: true,
  },
  // Payment method type: 'card' or 'bank_account'
  type: {
    type: String,
    enum: ["card", "bank_account"],
    required: true,
    default: "card",
  },
  // Card-specific fields (optional for bank accounts)
  card_brand: {
    type: String,
    enum: [
      "visa",
      "mastercard",
      "amex",
      "discover",
      "jcb",
      "diners",
      "unionpay",
      "unknown",
    ],
  },
  card_last4: {
    type: String,
    length: 4,
  },
  card_exp_month: {
    type: Number,
    min: 1,
    max: 12,
  },
  card_exp_year: {
    type: Number,
    min: new Date().getFullYear(),
  },
  card_fingerprint: {
    type: String,
  },
  // Bank-account specific fields
  bank_name: {
    type: String,
  },
  bank_last4: {
    type: String,
    length: 4,
  },
  bank_account_holder_type: {
    type: String,
  },
  bank_account_holder_name: {
    type: String,
  },
  bank_verified: {
    type: Boolean,
    default: false,
  },
  is_default: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save middleware to update the updated_at field
paymentCardSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

// Index for better query performance
paymentCardSchema.index({ user: 1 });
paymentCardSchema.index({ stripe_customer_id: 1 });

module.exports = mongoose.model("PaymentCard", paymentCardSchema);
