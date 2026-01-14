const mongoose = require("mongoose");

const escrowSchema = new mongoose.Schema({
  order_id: {
    type: String,
  },
  stripe_payment_intent_id: {
    type: String,
    required: true,
    unique: true,
  },
  stripe_charge_id: {
    type: String,
  },
  seller_stripe_account_id: {
    type: String,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: "usd",
  },
  status: {
    type: String,
    enum: ["held", "released", "refunded", "failed"],
    default: "held",
  },
  application_fee_amount: {
    type: Number,
  },
  release_transfer_id: {
    type: String,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  released_at: {
    type: Date,
  },
  refunded_at: {
    type: Date,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
});

escrowSchema.index({ stripe_payment_intent_id: 1 });
escrowSchema.index({ stripe_charge_id: 1 });

module.exports = mongoose.model("Escrow", escrowSchema);
