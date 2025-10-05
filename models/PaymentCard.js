const mongoose = require("mongoose");

const paymentCardSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  card_number: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function (v) {
        // Basic validation for card number (should be 13-19 digits)
        return /^\d{13,19}$/.test(v.replace(/\s/g, ""));
      },
      message: "Card number must be between 13-19 digits",
    },
  },
  card_holder_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  card_type: {
    type: String,
    required: false,
    enum: ["visa", "mastercard", "amex", "discover", "jcb", "diners", "other"],
  },
  expiry_month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
    validate: {
      validator: function (v) {
        return Number.isInteger(v) && v >= 1 && v <= 12;
      },
      message: "Expiry month must be between 1 and 12",
    },
  },
  expiry_year: {
    type: Number,
    required: true,
    min: new Date().getFullYear(),
    validate: {
      validator: function (v) {
        return Number.isInteger(v) && v >= new Date().getFullYear();
      },
      message: "Expiry year must be current year or later",
    },
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

// Pre-save middleware to auto-detect card type
paymentCardSchema.pre("save", function (next) {
  if (this.isModified("card_number") || this.isNew) {
    const cleanNumber = this.card_number.replace(/\s/g, "");

    // Card type detection based on first digits
    if (/^4/.test(cleanNumber)) {
      this.card_type = "visa";
    } else if (/^5[1-5]/.test(cleanNumber)) {
      this.card_type = "mastercard";
    } else if (/^3[47]/.test(cleanNumber)) {
      this.card_type = "amex";
    } else if (/^6(?:011|5[0-9]{2})/.test(cleanNumber)) {
      this.card_type = "discover";
    } else if (/^35[2-8]/.test(cleanNumber)) {
      this.card_type = "jcb";
    } else if (/^3[0689]/.test(cleanNumber)) {
      this.card_type = "diners";
    } else {
      this.card_type = "other";
    }
  }
  next();
});

// Index for better query performance
paymentCardSchema.index({ user: 1 });

module.exports = mongoose.model("PaymentCard", paymentCardSchema);
