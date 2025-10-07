const PaymentCard = require("../models/PaymentCard");
const stripeService = require("./stripeService");

class PaymentCardService {
  async addPaymentCard(paymentMethodId, userId) {
    try {
      // Get or create Stripe customer
      const stripeCustomerId = await stripeService.getOrCreateCustomer(userId);

      // Attach payment method directly to customer
      const stripePaymentMethod = await stripeService.attachPaymentMethod(
        paymentMethodId,
        stripeCustomerId
      );

      // Check if this is the first card for the user
      const existingCards = await PaymentCard.find({ user: userId });
      const isDefault = existingCards.length === 0;

      // If this is the first card, set it as default in Stripe
      if (isDefault) {
        await stripeService.setDefaultPaymentMethod(
          stripeCustomerId,
          stripePaymentMethod.id
        );
      }

      // Save payment card to database
      const paymentCard = new PaymentCard({
        user: userId,
        stripe_payment_method_id: stripePaymentMethod.id,
        stripe_customer_id: stripeCustomerId,
        card_brand: stripePaymentMethod.card.brand,
        card_last4: stripePaymentMethod.card.last4,
        card_exp_month: stripePaymentMethod.card.exp_month,
        card_exp_year: stripePaymentMethod.card.exp_year,
        card_fingerprint: stripePaymentMethod.card.fingerprint,
        is_default: isDefault,
      });

      const savedCard = await paymentCard.save();
      return await PaymentCard.findById(savedCard._id).populate(
        "user",
        "first_name last_name email"
      );
    } catch (error) {
      throw new Error(`Failed to add payment card: ${error.message}`);
    }
  }

  async getUserPaymentCards(userId) {
    try {
      return await PaymentCard.find({ user: userId })
        .populate("user", "first_name last_name email")
        .sort({ created_at: -1 });
    } catch (error) {
      throw new Error(`Failed to fetch payment cards: ${error.message}`);
    }
  }

  async getPaymentCardById(cardId, userId) {
    try {
      const paymentCard = await PaymentCard.findOne({
        _id: cardId,
        user: userId,
      }).populate("user", "first_name last_name email");

      if (!paymentCard) {
        throw new Error("Payment card not found");
      }

      return paymentCard;
    } catch (error) {
      throw new Error(`Failed to fetch payment card: ${error.message}`);
    }
  }

  async updatePaymentCard(cardId, userId, updateData) {
    try {
      const paymentCard = await PaymentCard.findOne({
        _id: cardId,
        user: userId,
      });

      if (!paymentCard) {
        throw new Error("Payment card not found");
      }

      // Update payment method in Stripe
      await stripeService.updatePaymentMethod(
        paymentCard.stripe_payment_method_id,
        updateData
      );

      // Update local database
      const updatedCard = await PaymentCard.findOneAndUpdate(
        { _id: cardId, user: userId },
        updateData,
        { new: true, runValidators: true }
      ).populate("user", "first_name last_name email");

      return updatedCard;
    } catch (error) {
      throw new Error(`Failed to update payment card: ${error.message}`);
    }
  }

  async deletePaymentCard(cardId, userId) {
    try {
      const paymentCard = await PaymentCard.findOne({
        _id: cardId,
        user: userId,
      });

      if (!paymentCard) {
        throw new Error("Payment card not found");
      }

      // Detach payment method from Stripe
      await stripeService.detachPaymentMethod(
        paymentCard.stripe_payment_method_id
      );

      // If this was the default card, set another card as default
      if (paymentCard.is_default) {
        const remainingCards = await PaymentCard.find({
          user: userId,
          _id: { $ne: cardId },
        });

        if (remainingCards.length > 0) {
          const newDefaultCard = remainingCards[0];
          newDefaultCard.is_default = true;
          await newDefaultCard.save();

          // Set as default in Stripe
          await stripeService.setDefaultPaymentMethod(
            paymentCard.stripe_customer_id,
            newDefaultCard.stripe_payment_method_id
          );
        }
      }

      // Remove from database
      await PaymentCard.findOneAndDelete({
        _id: cardId,
        user: userId,
      });

      return { message: "Payment card deleted successfully" };
    } catch (error) {
      throw new Error(`Failed to delete payment card: ${error.message}`);
    }
  }
}

module.exports = new PaymentCardService();
