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
    required: true,
    enum: ["visa", "mastercard", "amex", "discover", "jcb", "diners", "other"],
    validate: {
      validator: function (v) {
        return [
          "visa",
          "mastercard",
          "amex",
          "discover",
          "jcb",
          "diners",
          "other",
        ].includes(v);
      },
      message:
        "Card type must be one of: visa, mastercard, amex, discover, jcb, diners, other",
    },
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
  is_default: {
    type: Boolean,
    default: false,
  },
  is_active: {
    type: Boolean,
    default: true,
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

// Pre-save middleware to ensure only one default card per user
paymentCardSchema.pre("save", async function (next) {
  if (this.is_default && this.isNew) {
    // If this card is being set as default, unset all other default cards for this user
    await this.constructor.updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { is_default: false }
    );
  }
  next();
});

// Index for better query performance
paymentCardSchema.index({ user: 1 });
paymentCardSchema.index({ user: 1, is_default: 1 });

module.exports = mongoose.model("PaymentCard", paymentCardSchema);
