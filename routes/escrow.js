const express = require("express");
const router = express.Router();
const escrowController = require("../controllers/escrowController");
const auth = require("../middleware/auth");

// Create escrow (authorize funds)
router.post("/escrow/create", auth, (req, res) =>
  escrowController.create(req, res)
);

// Release escrow (capture)
router.post("/escrow/release", auth, (req, res) =>
  escrowController.release(req, res)
);

// Refund escrow
router.post("/escrow/refund", auth, (req, res) =>
  escrowController.refund(req, res)
);

// Get escrow
router.get("/escrow/:id", auth, (req, res) => escrowController.get(req, res));

module.exports = router;
