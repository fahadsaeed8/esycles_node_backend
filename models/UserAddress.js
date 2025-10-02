
const mongoose = require("mongoose");

const BillingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  country: { type: mongoose.Schema.Types.ObjectId, ref: "Country", required: true },
  state: { type: mongoose.Schema.Types.ObjectId, ref: "State", required: true },
  city: { type: mongoose.Schema.Types.ObjectId, ref: "City", required: true },

  postcode: { type: String, required: true },
  address: { type: String, required: true },   // Full address line
  building: { type: String },                  // House No / Street

  label: { type: String, enum: ["home", "office", "other"], default: "home" },
  is_default: { type: Boolean, default: false }
}, { timestamps: true });



module.exports = mongoose.model("UserAddress", BillingSchema);