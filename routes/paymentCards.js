const express = require("express");
const router = express.Router();
const paymentCardController = require("../controllers/paymentCardController");
const auth = require("../middleware/auth");
const {
  validateBody,
  validateParams,
} = require("../validations/validationMiddleware");
const {
  addPaymentCardSchema,
  updatePaymentCardSchema,
  cardIdParamSchema,
} = require("../validations/paymentCardValidation");

router.post(
  "/payment-cards",
  auth,
  validateBody(addPaymentCardSchema),
  paymentCardController.addPaymentCard
);

router.get("/payment-cards", auth, paymentCardController.getUserPaymentCards);

router.put(
  "/payment-cards/:id",
  auth,
  validateParams(cardIdParamSchema),
  validateBody(updatePaymentCardSchema),
  paymentCardController.updatePaymentCard
);

router.delete(
  "/payment-cards/:id",
  auth,
  validateParams(cardIdParamSchema),
  paymentCardController.deletePaymentCard
);

module.exports = router;
