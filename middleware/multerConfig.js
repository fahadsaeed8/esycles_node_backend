// multerConfig.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = ["uploads/products", "uploads/reviews"];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

ensureUploadDirs();

// Configure multer for product image uploads
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/products/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "product-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// Configure multer for review image uploads
const reviewStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/reviews/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "review-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const returnOrderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/return_order/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "review-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter for images only
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

// Create multer instances
const uploadProductImages = multer({
  storage: productStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: imageFilter,
});

const uploadReviewImages = multer({
  storage: reviewStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: imageFilter,
});
const uploadReturnoorderImages = multer({
  storage: returnOrderStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: imageFilter,
});

// Single file upload (for cases where you only need one image)
const uploadSingleProductImage = uploadProductImages.single("image");
const uploadSingleReviewImage = uploadReviewImages.single("image");

// Multiple files upload (for multiple images)
const uploadMultipleProductImages = uploadProductImages.array("images", 5); // Max 5 images
const uploadMultipleReviewImages = uploadReviewImages.array("images", 5); // Max 5 images
const uploadMultipleReturnorderImages = uploadReturnoorderImages.array("return_images", 5); // Max 5 images

// Export the configured multer instances
module.exports = {
  uploadProductImages,
  uploadReviewImages,
  uploadSingleProductImage,
  uploadSingleReviewImage,
  uploadMultipleProductImages,
  uploadMultipleReviewImages,
  uploadMultipleReturnorderImages
};