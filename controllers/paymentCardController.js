const paymentCardService = require("../services/paymentCardService");
const stripeService = require("../services/stripeService");
const PaymentCard = require("../models/PaymentCard");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Add a new payment card
 * POST /api/payment-cards
 */
async function addPaymentCard(req, res) {
  try {
    const userId = req.user.id;
    const { payment_method_id } = req.body;

    if (!payment_method_id) {
      return res.status(400).json({
        success: false,
        message: "Payment method ID is required",
      });
    }

    const paymentCard = await paymentCardService.addPaymentCard(
      payment_method_id,
      userId
    );

    res.status(201).json({
      success: true,
      message: "Payment card added successfully",
      data: paymentCard,
    });
  } catch (error) {
    console.error("Add payment card error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add payment card",
    });
  }
}

/**
 * Get all payment cards for the authenticated user
 * GET /api/payment-cards
 */
async function getUserPaymentCards(req, res) {
  try {
    const userId = req.user.id;
    const paymentCards = await paymentCardService.getUserPaymentCards(userId);

    res.status(200).json({
      success: true,
      message: "Payment cards retrieved successfully",
      data: paymentCards,
    });
  } catch (error) {
    console.error("Get payment cards error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve payment cards",
    });
  }
}

/**
 * Get a specific payment card by ID
 * GET /api/payment-cards/:id
 */
async function getPaymentCardById(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const paymentCard = await paymentCardService.getPaymentCardById(id, userId);

    res.status(200).json({
      success: true,
      message: "Payment card retrieved successfully",
      data: paymentCard,
    });
  } catch (error) {
    console.error("Get payment card error:", error);
    res.status(404).json({
      success: false,
      message: error.message || "Payment card not found",
    });
  }
}

/**
 * Update a payment card
 * PUT /api/payment-cards/:id
 */
async function updatePaymentCard(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    const paymentCard = await paymentCardService.updatePaymentCard(
      id,
      userId,
      updateData
    );

    res.status(200).json({
      success: true,
      message: "Payment card updated successfully",
      data: paymentCard,
    });
  } catch (error) {
    console.error("Update payment card error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update payment card",
    });
  }
}

async function deletePaymentCard(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await paymentCardService.deletePaymentCard(id, userId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Delete payment card error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete payment card",
    });
  }
}

async function createSetupIntent(req, res) {
  try {
    const userId = req.user.id;

    // Get or create Stripe customer
    const stripeCustomerId = await stripeService.getOrCreateCustomer(userId);

    // Create setup intent
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: "off_session",
    });

    res.status(200).json({
      success: true,
      message: "Setup intent created successfully",
      data: {
        client_secret: setupIntent.client_secret,
        setup_intent_id: setupIntent.id,
      },
    });
  } catch (error) {
    console.error("Create setup intent error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create setup intent",
    });
  }
}

module.exports = {
  addPaymentCard,
  getUserPaymentCards,
  getPaymentCardById,
  updatePaymentCard,
  deletePaymentCard,
  createSetupIntent,
};
