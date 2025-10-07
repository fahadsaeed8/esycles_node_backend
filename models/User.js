const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
  first_name: {
    type: String,
    required: true,
    trim: true,
  },
  last_name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, "Please enter a valid email"],
  },
  mobile_number: {
    type: String,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  role: {
    type: String,
    enum: ["vendor", "customer", "admin", "influencer"],
    default: "customer",
  },
  address: {
    street: String,
    city: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
    state: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
    country: { type: mongoose.Schema.Types.ObjectId, ref: "Country" },
    zip_code: String,
  },
  company_info: {
    company_name: {
      type: String,
      required: function () {
        return this.role === "vendor";
      },
    },
    title: {
      type: String,
      required: function () {
        return this.role === "vendor";
      },
    },
    tax_id: String,
    business_registration: String,
    website: String,
  },
  language: { type: mongoose.Schema.Types.ObjectId, ref: "Language" },
  currency: String,
  receive_updates: {
    type: Boolean,
    default: false,
  },
  agreed_to_terms: {
    type: Boolean,
    default: false,
  },
  is_active: {
    type: Boolean,
    default: false,
  },
  is_staff: {
    type: Boolean,
    default: false,
  },
  stripe_customer_id: {
    type: String,
    unique: true,
    sparse: true,
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

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  this.updated_at = new Date();
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
