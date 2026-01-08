const express = require("express");
const router = express.Router();
const stripeController = require("../controllers/stripeController");
const auth = require("../middleware/auth");

// Create setup intent for linking bank account
router.post("/stripe/setup-intent", auth, (req, res) =>
  stripeController.createSetupIntent(req, res)
);

// Attach bank payment method after frontend obtains a payment_method
router.post("/stripe/attach-bank", auth, (req, res) =>
  stripeController.attachBank(req, res)
);

// Verify micro-deposits (amounts in cents)
router.post("/stripe/verify-microdeposits", auth, (req, res) =>
  stripeController.verifyMicrodeposits(req, res)
);

// Create an ACH PaymentIntent (off_session)
router.post("/stripe/create-ach-payment-intent", auth, (req, res) =>
  stripeController.createACHPaymentIntent(req, res)
);

// Financial Connections session (instant verification)
router.post("/stripe/financial-connections-session", auth, (req, res) =>
  stripeController.createFinancialConnectionsSession(req, res)
);

// Attach a Financial Connections account (frontend returns financial_connections_account_id)
router.post("/stripe/attach-financial-account", auth, (req, res) =>
  stripeController.attachFinancialAccount(req, res)
);

// Create a PaymentIntent for digital wallets (Apple/Google Pay)
router.post("/stripe/create-wallet-payment-intent", auth, (req, res) =>
  stripeController.createWalletPaymentIntent(req, res)
);

module.exports = router;
