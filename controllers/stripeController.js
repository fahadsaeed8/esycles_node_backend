const stripeService = require("../services/stripeService");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const PaymentCard = require("../models/PaymentCard");
const dotenv = require("dotenv");
dotenv.config();

class StripeController {
  // Create a SetupIntent for linking a US bank account
  async createSetupIntent(req, res) {
    try {
      const userId = req.user._id;
      const customerId = await stripeService.getOrCreateCustomer(userId);
      const setupIntent = await stripeService.createSetupIntent(customerId);
      res.json({ clientSecret: setupIntent.client_secret, id: setupIntent.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Create Financial Connections session for instant verification (Stripe Link)
  async createFinancialConnectionsSession(req, res) {
    try {
      const userId = req.user._id;
      const customerId = await stripeService.getOrCreateCustomer(userId);
      const session = await stripeService.createFinancialConnectionsSession(
        customerId
      );
      res.json({ client_secret: session.client_secret, id: session.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Accept a financial_connections_account id from frontend and create/attach PaymentMethod
  async attachFinancialAccount(req, res) {
    try {
      const userId = req.user._id;
      const { financial_connections_account_id } = req.body;
      if (!financial_connections_account_id) {
        return res
          .status(400)
          .json({ error: "financial_connections_account_id is required" });
      }

      const customerId = await stripeService.getOrCreateCustomer(userId);
      const pm = await stripeService.createPaymentMethodFromFinancialAccount(
        financial_connections_account_id,
        customerId
      );

      // Optionally set as default
      await stripeService.setDefaultPaymentMethod(customerId, pm.id);

      // Persist using PaymentCard model
      const existing = await PaymentCard.findOne({
        stripe_payment_method_id: pm.id,
      });
      if (!existing) {
        const data = {
          user: userId,
          stripe_payment_method_id: pm.id,
          stripe_customer_id: customerId,
          is_default: false,
          type: "bank_account",
          bank_name: pm.us_bank_account?.bank_name,
          bank_last4: pm.us_bank_account?.last4,
          bank_account_holder_type: pm.us_bank_account?.account_holder_type,
          bank_account_holder_name:
            pm.billing_details?.name || pm.us_bank_account?.account_holder_name,
        };

        const paymentCard = new PaymentCard(data);
        await paymentCard.save();
      }

      res.json({ success: true, paymentMethod: pm });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Attach bank payment method to customer and persist
  async attachBank(req, res) {
    try {
      const userId = req.user._id;
      const { payment_method_id } = req.body;
      if (!payment_method_id) {
        return res.status(400).json({ error: "payment_method_id is required" });
      }

      const customerId = await stripeService.getOrCreateCustomer(userId);
      const pm = await stripeService.attachPaymentMethod(
        payment_method_id,
        customerId
      );

      // If desired, set as default
      await stripeService.setDefaultPaymentMethod(customerId, pm.id);

      // Save to DB using existing PaymentCard model (supports bank_account now)
      const existing = await PaymentCard.findOne({
        stripe_payment_method_id: pm.id,
      });
      if (!existing) {
        const data = {
          user: userId,
          stripe_payment_method_id: pm.id,
          stripe_customer_id: customerId,
          is_default: false,
          type: pm.type === "us_bank_account" ? "bank_account" : "card",
        };

        if (pm.type === "us_bank_account") {
          data.bank_name = pm.us_bank_account?.bank_name;
          data.bank_last4 = pm.us_bank_account?.last4;
          data.bank_account_holder_type =
            pm.us_bank_account?.account_holder_type;
          data.bank_account_holder_name =
            pm.billing_details?.name || pm.us_bank_account?.account_holder_name;
        } else if (pm.type === "card") {
          data.card_brand = pm.card?.brand;
          data.card_last4 = pm.card?.last4;
        }

        const paymentCard = new PaymentCard(data);
        await paymentCard.save();
      }

      res.json({ success: true, paymentMethod: pm });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Verify micro-deposits (amounts are expected in cents)
  async verifyMicrodeposits(req, res) {
    try {
      const userId = req.user._id;
      const { payment_method_id, amounts } = req.body;
      if (!payment_method_id || !Array.isArray(amounts)) {
        return res
          .status(400)
          .json({ error: "payment_method_id and amounts are required" });
      }

      const verification = await stripeService.verifyMicrodeposits(
        payment_method_id,
        amounts
      );

      // If verification succeeded, update DB record
      if (verification && verification.status === "succeeded") {
        await PaymentCard.findOneAndUpdate(
          { stripe_payment_method_id: payment_method_id },
          { bank_verified: true },
          { new: true }
        );
      }

      res.json({ success: true, verification });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Create ACH PaymentIntent (off_session). Body: { amount, currency, payment_method_id }
  async createACHPaymentIntent(req, res) {
    try {
      const userId = req.user._id;
      const { amount, currency = "usd", payment_method_id } = req.body;
      if (!amount || !payment_method_id) {
        return res
          .status(400)
          .json({ error: "amount and payment_method_id are required" });
      }

      const customerId = await stripeService.getOrCreateCustomer(userId);
      const pi = await stripeService.createACHPaymentIntent({
        customerId,
        amount,
        currency,
        paymentMethodId: payment_method_id,
        verificationMethod: "microdeposits",
      });

      res.json({ paymentIntent: pi });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Stripe webhook handler (expects raw body)
  async webhook(req, res) {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      const type = event.type;
      const object = event.data.object;

      // Handle events of interest
      if (
        type === "setup_intent.succeeded" ||
        type === "setup_intent.updated"
      ) {
        // A SetupIntent succeeded - the payment method may be attached/verified
        const setupIntent = object;
        const pmId = setupIntent.payment_method;
        if (pmId) {
          // mark as verified if status indicates
          if (
            setupIntent.status === "succeeded" ||
            setupIntent.status === "requires_capture"
          ) {
            await PaymentCard.findOneAndUpdate(
              { stripe_payment_method_id: pmId },
              { bank_verified: true }
            );
          }
        }
      } else if (type.startsWith("payment_intent.")) {
        const pi = object;
        // Example: payment_intent.succeeded
        if (type === "payment_intent.succeeded") {
          // find related payment method and mark any local order/record as paid as needed
          // This is domain-specific; emit logs for now
          console.log("ACH payment succeeded:", pi.id);
        } else if (type === "payment_intent.processing") {
          console.log("ACH payment processing:", pi.id);
        } else if (type === "payment_intent.payment_failed") {
          console.log("ACH payment failed:", pi.id);
        }
      } else if (
        type === "payment_method.automatically_updated" ||
        type === "payment_method.updated"
      ) {
        const pm = object;
        // If a us_bank_account payment method becomes verified/updated, reflect it in DB
        if (pm && pm.type === "us_bank_account") {
          const updates = {};
          if (pm.us_bank_account?.bank_name)
            updates.bank_name = pm.us_bank_account.bank_name;
          if (pm.us_bank_account?.last4)
            updates.bank_last4 = pm.us_bank_account.last4;
          if (Object.keys(updates).length > 0) {
            await PaymentCard.findOneAndUpdate(
              { stripe_payment_method_id: pm.id },
              updates
            );
          }
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Error handling webhook:", err);
      res.status(500).send();
    }
  }
}

module.exports = new StripeController();
