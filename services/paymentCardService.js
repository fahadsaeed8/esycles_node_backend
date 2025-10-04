const PaymentCard = require("../models/PaymentCard");

class PaymentCardService {
  /**
   * Add a new payment card for a user
   * @param {Object} cardData - Card information
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created payment card
   */
  async addPaymentCard(cardData, userId) {
    try {
      // Check if user already has a default card and this is being set as default
      if (cardData.is_default) {
        await PaymentCard.updateMany({ user: userId }, { is_default: false });
      }

      const paymentCard = new PaymentCard({
        ...cardData,
        user: userId,
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

  /**
   * Get all payment cards for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of payment cards
   */
  async getUserPaymentCards(userId) {
    try {
      return await PaymentCard.find({ user: userId, is_active: true })
        .populate("user", "first_name last_name email")
        .sort({ created_at: -1 });
    } catch (error) {
      throw new Error(`Failed to fetch payment cards: ${error.message}`);
    }
  }

  /**
   * Update a payment card
   * @param {string} cardId - Card ID
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated payment card
   */
  async updatePaymentCard(cardId, userId, updateData) {
    try {
      // If setting as default, unset other default cards
      if (updateData.is_default) {
        await PaymentCard.updateMany(
          { user: userId, _id: { $ne: cardId } },
          { is_default: false }
        );
      }

      const updatedCard = await PaymentCard.findOneAndUpdate(
        { _id: cardId, user: userId },
        updateData,
        { new: true, runValidators: true }
      ).populate("user", "first_name last_name email");

      if (!updatedCard) {
        throw new Error("Payment card not found");
      }

      return updatedCard;
    } catch (error) {
      throw new Error(`Failed to update payment card: ${error.message}`);
    }
  }

  /**
   * Delete a payment card (soft delete by setting is_active to false)
   * @param {string} cardId - Card ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Success message
   */
  async deletePaymentCard(cardId, userId) {
    try {
      const deletedCard = await PaymentCard.findOneAndUpdate(
        { _id: cardId, user: userId },
        { is_active: false },
        { new: true }
      );

      if (!deletedCard) {
        throw new Error("Payment card not found");
      }

      return { message: "Payment card deleted successfully" };
    } catch (error) {
      throw new Error(`Failed to delete payment card: ${error.message}`);
    }
  }
}

module.exports = new PaymentCardService();
