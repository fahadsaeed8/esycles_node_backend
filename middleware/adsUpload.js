const fs = require("fs");
const multer = require("multer");
const path = require("path");

const returnOrderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/Ads";

    // ✅ Ensure directory exists
    fs.mkdirSync(uploadPath, { recursive: true });

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "ads-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadReturnOrderImages = multer({
  storage: returnOrderStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) cb(null, true);
    else cb(new Error("Only image files are allowed!"));
  },
});

const uploadMultipleReturnOrderImages = uploadReturnOrderImages.array("images", 5);

module.exports = uploadMultipleReturnOrderImages;
