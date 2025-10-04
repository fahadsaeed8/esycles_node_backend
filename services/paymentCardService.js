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
      return await PaymentCard.find({ user: userId })
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
   * Delete a payment card (hard delete)
   * @param {string} cardId - Card ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Success message
   */
  async deletePaymentCard(cardId, userId) {
    try {
      const deletedCard = await PaymentCard.findOneAndDelete({
        _id: cardId,
        user: userId,
      });

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
