const stripeService = require("../services/stripeService");
const Escrow = require("../models/Escrow");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const AdsModels = require("../models/Ads");

const User = require("../models/User");

class EscrowController {
  // Create escrow (authorize funds)
  async create(req, res) {
    try {
      const userId = req.user._id;
      const {
        adId,
        amount,
        currency = "usd",
        metadata = {},
        applicationFeeAmount,
      } = req.body;

      if (!amount) {
        return res.status(400).json({ error: "amount is required" });
      }

      // Derive seller connected account from DB using adId (do not trust client)
      let sellerStripeAccountId = null;
      let ad = null;
      if (adId) {
        ad =
          (await AdsModels.ClassifiedAd.findById(adId).lean()) ||
          (await AdsModels.AuctionAd.findById(adId).lean()) ||
          (await AdsModels.MapAd.findById(adId).lean());
      }
      if (ad) {
        const sellerRef = ad.user || ad.seller || null;
        if (sellerRef) {
          const seller = await User.findById(sellerRef).lean();
          if (seller) {
            sellerStripeAccountId = seller.connect_account_id || null;
          }
        }
      }
      // Require seller connected account for escrow payments
      if (!sellerStripeAccountId) {
        return res
          .status(400)
          .json({ error: "Vendor is not onboarded for escrow payments" });
      }

      const customerId = await stripeService.getOrCreateCustomer(userId);
      // Create PaymentIntent WITHOUT transfer_data to hold funds on platform (true escrow)
      const pi = await stripeService.createEscrowPaymentIntent({
        customerId,
        amount,
        currency,
        metadata: { ...metadata, adId },
        sellerAccountId: null, // ensure no transfer_data set
        applicationFeeAmount,
      });

      // Persist Escrow record
      const escrow = new Escrow({
        order_id: adId,
        stripe_payment_intent_id: pi.id,
        seller_stripe_account_id: sellerStripeAccountId,
        amount,
        currency,
        status: "held",
        metadata,
      });
      await escrow.save();

      res.json({ clientSecret: pi.client_secret, escrow });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Release escrow (capture)
  async release(req, res) {
    try {
      const { escrowId, amountToCapture } = req.body;
      if (!escrowId)
        return res.status(400).json({ error: "escrowId is required" });

      const escrow = await Escrow.findById(escrowId);
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "held")
        return res.status(400).json({ error: "Escrow is not in held state" });

      const pi = await stripeService.capturePaymentIntent(
        escrow.stripe_payment_intent_id,
        amountToCapture
      );

      const charge = pi.charges?.data?.[0];
      if (charge) {
        escrow.stripe_charge_id = charge.id;
      }
      // Attempt to transfer to seller if seller connected account exists and is ready
      try {
        if (escrow.seller_stripe_account_id && charge) {
          const acctStatus = await stripeService.verifyConnectAccount(
            escrow.seller_stripe_account_id
          );
          if (acctStatus.charges_enabled && acctStatus.payouts_enabled) {
            const transfer =
              await stripeService.createTransferToConnectedAccount({
                amount: escrow.amount,
                destination: escrow.seller_stripe_account_id,
                sourceTransaction: charge.id,
              });
            escrow.release_transfer_id = transfer.id;
            escrow.transfer_status = "transferred";
          } else {
            escrow.transfer_status = "pending_account_not_ready";
          }
        }
      } catch (e) {
        // log and mark transfer as failed so operator can retry
        console.warn("Transfer to connected account failed:", e.message);
        escrow.transfer_status = "transfer_failed";
      }

      escrow.status = "released";
      escrow.released_at = new Date();
      await escrow.save();

      res.json({ success: true, paymentIntent: pi, escrow });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Refund escrow
  async refund(req, res) {
    try {
      const { escrowId, amount } = req.body;
      if (!escrowId)
        return res.status(400).json({ error: "escrowId is required" });

      const escrow = await Escrow.findById(escrowId);
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (!escrow.stripe_charge_id)
        return res
          .status(400)
          .json({ error: "No charge associated with escrow" });

      const refund = await stripeService.refundCharge(
        escrow.stripe_charge_id,
        amount
      );
      escrow.status = "refunded";
      escrow.refunded_at = new Date();
      await escrow.save();

      res.json({ success: true, refund, escrow });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async get(req, res) {
    try {
      const { id } = req.params;
      const escrow = await Escrow.findById(id);
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      res.json({ escrow });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new EscrowController();
