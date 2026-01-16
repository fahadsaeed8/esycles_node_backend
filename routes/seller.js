const express = require("express");
const router = express.Router();
const sellerController = require("../controllers/sellerController");
const auth = require("../middleware/auth");

// Create connect account and onboarding link
router.post("/seller/onboard", auth, (req, res) =>
  sellerController.createOnboard(req, res)
);

// Get seller connect account status
router.get("/seller/account", auth, (req, res) =>
  sellerController.getAccount(req, res)
);

// Simple onboarding status (completed or not)
router.get("/seller/onboard/status", auth, (req, res) =>
  sellerController.onboardingStatus(req, res)
);

module.exports = router;
