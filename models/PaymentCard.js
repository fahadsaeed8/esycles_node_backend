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
  card_brand: {
    type: String,
    required: true,
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
    required: true,
    length: 4,
  },
  card_exp_month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  card_exp_year: {
    type: Number,
    required: true,
    min: new Date().getFullYear(),
  },
  card_fingerprint: {
    type: String,
    required: false,
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
