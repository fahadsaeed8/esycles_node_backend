const mongoose = require("mongoose");


const adDurationSchema = new mongoose.Schema({
  day: {
    type: Number, // e.g. 1, 7, 30
    required: true,
  },
  price: {
    type: Number, // e.g. 2, 5, 10
    required: true,
  },
  type: {
    type: String,
    enum: ["Classified", "Auction"],
    required: true,

  },
}, { timestamps: true });


const classifiedAdSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // 1. Ad Duration & Plan
  adDuration: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "adDuration",
    required: true,
  },
  adPackageType: {
    type: String, 
    enum: ["Standard", "Featured", "Premium"],
    default: "Standard (no fee)",
  },

  // 2. Seller Information
  sellerType: {
    type: String, // "Individual" | "Business"
    enum: ["Individual", "Business"],
    required: true,
  },
  sellerName: {
    type: String,
    required: true,
  },
  contactNumber: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },

  latitude: {
    type: Number,
  },
  longitude: {
    type: Number,
  },

  views: {
    type: Number,
    default: 0,
  },
  calls: {
    type: Number,
    default: 0,
  },
  chats: {
    type: Number,
    default: 0,
  },
  // 3. Product / Item Information
  category: { type: String, enum: ["BICYCLES" , "EBIKES", "ESCOOTERS", "EXERCISE BICYCLES", "ESKATEBOARDS", "HOVERBOARDS"] },

  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  condition: {
    type: String,
    enum: ["New", "Like_New", "Open_Box", "Acceptable", "Pre_Owned", "As_Is"],
    required: true,
  },
  brand: {
    type: String,
  },
  yearOfManufacture: {
    type: Number,
  },

  startDate: { type: Date },
  expiryDate: { type: Date },
  adLife: {
    type: Number,
  },
  // 4. Media Uploads
  images: [
    {
      type: String, // store image URLs
    },
  ],
  videoLink: {
    type: String, // YouTube or MP4 URL
  },

  // 5. Pricing & Payment
  pricingType: {
    type: String, // "Fixed Price" | "Negotiable"
    enum: ["Fixed_Price", "Negotiable", "Best_Offer", "Free", "Exchange"],
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String, 
    enum: ["Cash_On_Delivery", "Online", "Escrow_Via_Marketplace"],
    required: true,
  },
  autoRenew: {
    type: Boolean,
    default: false,
  },

  deliveryOption: {
    type: String, 
    enum: ["Pickup_Only", "Courier_Delivery", "Local_Delivery", "Online"],
    required: true,
  },
  deliveryFee: {
    type: String,
    enum: ["Free", "Paid_By_Seller", "Paid_By_Buyer"],
    default: "Free",
  },
  is_pause: {
    type: Boolean,
    default: false,
  },
  is_featured: {
    type: Boolean,
    default: false,
  },

  is_promoted: {
    type: Boolean,
    default: false,
  },

  // 7. Policy Acknowledgment
  agreedTerms: {
    type: Boolean,
    default: false,
  },
  agreedPolicy: {
    type: Boolean,
    default: false,
  },
  ad_status: {
    type: String,
    enum: ["Pending", "Accepted", "Rejected"],
    default: "Pending",
  },
  // 8. Submission
  status: {
    type: String, // Draft, Published
    enum: ["Draft", "Published"],
    default: "Draft",
  },
}, { timestamps: true });


const savedClassifiedAdSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    classifiedAd: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassifiedAd",
      required: true,
    },
  },
  { timestamps: true }
);

savedClassifiedAdSchema.index({ user: 1, classifiedAd: 1 }, { unique: true });


const auctionAdSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // 1. Auction Duration & Type
  auctionDuration: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "adDuration",
    required: true,
  },

  auctionType: {
    type: String, // "Buy It Now", "Bidding"
    enum: ["Buy_Now", "Reverse_Price", "Bidding_Increase_Percentage", "Minimum_Price_Increase"],
    required: true,
  },

  // 2. Seller Information
  sellerType: {
    type: String, // "Individual" | "Business"
    enum: ["Individual", "Business"],
    required: true,
  },
  sellerName: {
    type: String,
    required: true,
  },
  contactNumber: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },

  location: {
    type: String,
    required: true,
  },

  latitude: {
    type: Number,
  },
  longitude: {
    type: Number,
  },

  views: {
    type: Number,
    default: 0,
  },
  calls: {
    type: Number,
    default: 0,
  },
  chats: {
    type: Number,
    default: 0,
  },
  // 3. Product / Item Information
  category: { type: String, enum: ["BICYCLES" , "EBIKES", "ESCOOTERS", "EXERCISE BICYCLES", "ESKATEBOARDS", "HOVERBOARDS"] },

  title: {
    type: String,
    maxlength: 80,
    required: true,
  },
  description: {
    type: String,
  },
  condition: {
    type: String,
    enum: ["New", "Like_New", "Open_Box", "Acceptable", "Pre_Owned", "As_Is"],
    required: true,
  },
  brand: {
    type: String,
  },
  year: {
    type: Number,
  },
  specifications: {
    type: String, // Extra details like size, frame, etc.
  },

  // 4. Media Uploads
  images: [
    {
      type: String, // image URLs
    },
  ],
  videoLink: {
    type: String, // YouTube or video link
  },

  // 5. Auction Pricing Rules
  buyNowPrice: {
    type: Number,
    required: true,
  },
  auctionFee: {
    type: Number, // Auto-calculated based on rules
    default: 0,
  },
  reservedPrice: {
    type: Number, // optional reserved price
  },

  // 6. Additional Pricing Options
  currency: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Currency",
    required: true,
  },
  
  shippingCost: {
    type: Number,
  },

  shippingtype: {
    type: String,
    enum: ["Free", "Paid_By_Sellet", "Paid_By_Buyer"],
    default: "Free",
    required: true,
  },
  deliveryOption: {
    type: String, 
    enum: ["Pickup_Only", "Courier_Delivery", "Local_Delivery", "Online"],
    required: true,
  },

  // 7. Bidding Controls & Buyer Settings
  verifiedUsersOnly: {
    type: Boolean,
    default: false,
  },
  minimumBid: {
    type: Number, // e.g. 5, 10, 25, 50...
  },
  maximumAutoBid: {
    type: Number, // optional auto-bid limit
  },

  startDate: { type: Date },
  expiryDate: { type: Date },
  adLife: {
    type: Number,
  },
  // 8. Advertising & Boost Options
  boostOptions: {
    standardAuction: { type: Boolean, default: true },
    featureInTopListings: { type: Boolean, default: false },
    promoteHomepage: { type: Boolean, default: false },
  },

  startingBid: { type: Number, default: 1 },
  bidIncrement: { type: Number, default: 1 },
  reservePrice: { type: Number }, // optional

  currentHighestAmount: { type: Number, default: 0 },
  currentHighestBidder: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  antiSnipingEnabled: { type: Boolean, default: false },
  extendedTime: { type: Number, default: 0 },

  // 9. Policy & Compliance
  agreedAuctionTerms: {
    type: Boolean,
    default: false,
  },
  agreedPolicy: {
    type: Boolean,
    default: false,
  },
  is_pause: {
    type: Boolean,
    default: false,
  },
  // 10. Submission
  ad_status: {
    type: String,
    enum: ["Pending", "Accepted", "Rejected"],
    default: "Pending",
  },
  status: {
    type: String,
    enum: ["Draft", "Published"],
    default: "Draft",
  },
}, { timestamps: true });

const savedAuctionAdSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    auctionAd: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuctionAd",
      required: true,
    },
  },
  { timestamps: true }
);

savedAuctionAdSchema.index({ user: 1, auctionAd: 1 }, { unique: true });

const bidHistorySchema = new mongoose.Schema(
  {
    auctionAd: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuctionAd",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Bid details
    bidType: {
      type: String,
      enum: ["Manual", "Automatic"],
      default: "Manual",
    },

    currentPlacedAmount: {
      type: Number,
      required: true,
      min: [1, "Bid price must be greater than 0"],
    },

    maxBidAmount: {
      type: Number, // only relevant if bidType === "Automatic"
    },

    offer_status: {
      type: String,
      enum: ["Pending", "Accepted", "Offered", "Rejected"],
      default: "Pending",
    },

    status: {
      type: String,
      enum: ["Leading", "Outbid", "Cancelled"],
      default: "Leading",
    },
  },
  { timestamps: true }
);

const adReportSchema = new mongoose.Schema(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },

    adType: { 
      type: String, 
      enum: ["Classified", "Auction"], 
      required: true 
    },

    classifiedAd: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "ClassifiedAd" 
    },

    auctionAd: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "AuctionAd" 
    },

    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: ["Pending", "Reviewed", "Resolved", "Dismissed"],
      default: "Pending",
    },
  },
  { timestamps: true }
);


const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuctionAd",
      required: false,
    },
    is_read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Export all models together
// Instead of overwriting, reuse existing models
module.exports = {
  ClassifiedAd:
    mongoose.models.ClassifiedAd ||
    mongoose.model("ClassifiedAd", classifiedAdSchema),

  AuctionAd:
    mongoose.models.AuctionAd ||
    mongoose.model("AuctionAd", auctionAdSchema),

  adDuration:
    mongoose.models.adDuration ||
    mongoose.model("adDuration", adDurationSchema),

  savedAuctionAd:
    mongoose.models.savedAuctionAd ||
    mongoose.model("savedAuctionAd", savedAuctionAdSchema),

  savedClassifiedAd:
    mongoose.models.savedClassifiedAd ||
    mongoose.model("savedClassifiedAd", savedClassifiedAdSchema),

  AdReport:
    mongoose.models.AdReport ||
    mongoose.model("AdReport", adReportSchema),

  BidHistory:
    mongoose.models.BidHistory ||
    mongoose.model("BidHistory", bidHistorySchema),

  Notification:
    mongoose.models.Notification ||
    mongoose.model("Notification", notificationSchema),
};
