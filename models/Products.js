const mongoose = require("mongoose");

// Discount Tier (sub-schema)
const DiscountTierSchema = new mongoose.Schema({
  min_qty: Number,
  max_qty: Number,
  price: Number,
});

// Brand Schema
const BrandSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String
}, { timestamps: true });

// Model Schema
const ModelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true },
}, { timestamps: true });

// Color Schema
const ColorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  hex: String
}, { timestamps: true });

// Product Schema
const ProductSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  model: { type: mongoose.Schema.Types.ObjectId, ref: "Model", required: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  color: { type: mongoose.Schema.Types.ObjectId, ref: "Color" },
  shipping: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingMethod" },

  rating: Number,
  reviews_count: Number,
  price: Number,
  old_price: Number,
  discount_price_tiers: [DiscountTierSchema],
  stock: Number,
  product_size: {
    type: Number,
    default: 26
  },
  type: { type: String, enum: ["BICYCLES" , "EBIKES", "ESCOOTERS", "EXERCISE BICYCLES", "ESKATEBOARDS", "HOVERBOARDS"] },
  foldable: Boolean,
  wattage: String,
  model_code: String,
  sku: String,
  sku_code: String,
  images: [String],
  return_policy: Boolean,
  customization_options: [String],
  MOQ: Number,
  installmentMonth:Number

}, { timestamps: true });

const ShippingMethodSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  description: { type: String }, 
  cost: { type: Number, required: true }, 
  estimated_days: { type: Number }
}, { timestamps: true });


const CartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, default: 1 },
  price: { type: Number, required: true } // snapshot of product price
}, { _id: true });

  
  const CartSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [CartItemSchema],
    total_price: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "checked_out"], default: "active" }
  }, { timestamps: true });


  // Counter Schema for auto-increment
  const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
  });
  
  const Counter = mongoose.model('Counter', CounterSchema);
  
  // Order Item Schema
  const OrderItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true } // locked price at purchase time
  }, { _id: false });
  
  // Order Schema
  const OrderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [OrderItemSchema],
    
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    
    order_source: { type: String, enum: ["cart", "shop_now"], required: true },
    cart: { type: mongoose.Schema.Types.ObjectId, ref: "Cart", default: null },
    
    total_price: { type: Number, required: true },
    payment_status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    shipping_method: { type: mongoose.Schema.Types.ObjectId, ref: "ShippingMethod", required: true },
  
    payment_method: { type: String, enum: ["card", "stripe", "cod"], default: "cod" },
    shipping_address: { type: mongoose.Schema.Types.ObjectId, ref: "UserAddress", required: true },
    order_status: { type: String, enum: ["pending", "processing", "shipped", "delivered", "cancelled", "return_requested", "returned"], default: "pending" },
    note: { type: String, default: null },
    
    // Auto-generated invoice number
    invoice_number: { type: String, unique: true },

  }, { timestamps: true });
  
  // Pre-save middleware to generate invoice number
  OrderSchema.pre('save', async function(next) {
    if (this.isNew && !this.invoice_number) {
      try {
        const counter = await Counter.findByIdAndUpdate(
          { _id: 'orderId' },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
        
        // Format invoice number with leading zeros
        this.invoice_number = `INV-${String(counter.seq).padStart(6, '0')}`;
        next();
      } catch (error) {
        next(error);
      }
    } else {
      next();
    }
  });
  
  const ReturnOrderSchema = new mongoose.Schema(
    {
      // Buyer-side info
      order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
      },
  
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
  
      product: {
        product_id: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: { type: String, required: true },
        sku: { type: String, required: true },
      },
  
      request_type: {
        type: String,
        enum: ["return", "cancellation"],
        required: true,
      },
  
      reason: {
        type: String,
        required: true,
      },
  
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
  
      condition: {
        type: String,
        enum: ["unused", "opened", "defective", "damaged", "not_applicable"],
        default: "not_applicable", // applies only for returns
      },
  
      preferred_resolution: {
        type: String,
        enum: ["refund", "replacement", "store_credit"],
        required: true,
      },
  
      evidence: [
        {
          type: String, // image URLs
        },
      ],
  
      additional_notes: {
        type: String,
      },
  
      // Seller/Admin side
      request_id: {
        type: String,
        unique: true, // could be auto-generated "RC-<timestamp>"
      },
  
      status: {
        type: String,
        enum: [
          "pending", // request created
          "approved",
          "rejected",
          "received", // item returned to seller
          "refunded",
          "canceled", // cancellation completed
        ],
        default: "pending",
      },
  
      return_shipping: {
        carrier: { type: String },
        tracking_number: { type: String },
        estimated_arrival: { type: Date },
      },
  
      internal_notes: {
        type: String, // seller/admin communication
      },
  
      resolution_date: {
        type: Date, // when refund/replacement completed
      },
  
      ai_risk_flag: {
        type: Boolean,
        default: false, // optional: fraud detection marker
      },
    },
    { timestamps: true }
  );

  const ReviewSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 255 },  // ✅ New field
    review: { type: String, maxlength: 1000 },
    images: [{ type: String }],
  
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    reports: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  }, { timestamps: true });
  
  ReviewSchema.index({ product: 1, user: 1 }, { unique: true });
  
// Export all models together
module.exports = {
  Brand: mongoose.model("Brand", BrandSchema),
  Model: mongoose.model("Model", ModelSchema),
  Color: mongoose.model("Color", ColorSchema),
  Product: mongoose.model("Product", ProductSchema),
  Cart: mongoose.model("Cart", CartSchema),
  Order: mongoose.model("Order", OrderSchema),
  ShippingMethod: mongoose.model("ShippingMethod", ShippingMethodSchema),
  Review: mongoose.model("Review", ReviewSchema),
  Counter: mongoose.model("Counter", CounterSchema),
  ReturnOrder: mongoose.model("ReturnOrder", ReturnOrderSchema),

};
