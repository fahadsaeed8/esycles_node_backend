const Stripe = require("stripe");
const User = require("../models/User");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class StripeService {
  /**
   * Create or get Stripe customer for a user
   * @param {string} userId - User ID
   * @returns {Promise<string>} Stripe customer ID
   */
  async getOrCreateCustomer(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // If user already has a Stripe customer ID, return it
      if (user.stripe_customer_id) {
        return user.stripe_customer_id;
      }

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        metadata: {
          userId: userId.toString(),
        },
      });

      // Update user with Stripe customer ID
      user.stripe_customer_id = customer.id;
      await user.save();

      return customer.id;
    } catch (error) {
      throw new Error(`Failed to create/get Stripe customer: ${error.message}`);
    }
  }

  /**
   * Create a Setup Intent for saving payment methods
   * @param {string} customerId - Stripe customer ID
   * @param {string} paymentMethodId - Payment method ID from frontend
   * @returns {Promise<Object>} Stripe setup intent
   */
  async createSetupIntent(customerId, paymentMethodId) {
    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method: paymentMethodId,
        usage: "off_session",
        confirm: true,
      });

      return setupIntent;
    } catch (error) {
      throw new Error(`Failed to create setup intent: ${error.message}`);
    }
  }

  /**
   * Confirm a Setup Intent
   * @param {string} setupIntentId - Setup Intent ID
   * @returns {Promise<Object>} Confirmed setup intent
   */
  async confirmSetupIntent(setupIntentId) {
    try {
      const setupIntent = await stripe.setupIntents.confirm(setupIntentId);
      return setupIntent;
    } catch (error) {
      throw new Error(`Failed to confirm setup intent: ${error.message}`);
    }
  }

  /**
   * Get all payment methods for a customer
   * @param {string} customerId - Stripe customer ID
   * @returns {Promise<Array>} Array of payment methods
   */
  async getCustomerPaymentMethods(customerId) {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
      });

      return paymentMethods.data;
    } catch (error) {
      throw new Error(`Failed to get payment methods: ${error.message}`);
    }
  }

  /**
   * Update a payment method
   * @param {string} paymentMethodId - Stripe payment method ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated payment method
   */
  async updatePaymentMethod(paymentMethodId, updateData) {
    try {
      const paymentMethod = await stripe.paymentMethods.update(
        paymentMethodId,
        {
          billing_details: {
            name: updateData.card_holder_name,
            email: updateData.email,
          },
        }
      );

      return paymentMethod;
    } catch (error) {
      throw new Error(`Failed to update payment method: ${error.message}`);
    }
  }

  /**
   * Detach a payment method from customer
   * @param {string} paymentMethodId - Stripe payment method ID
   * @returns {Promise<Object>} Detached payment method
   */
  async detachPaymentMethod(paymentMethodId) {
    try {
      const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);

      return paymentMethod;
    } catch (error) {
      throw new Error(`Failed to detach payment method: ${error.message}`);
    }
  }

  /**
   * Set default payment method for customer
   * @param {string} customerId - Stripe customer ID
   * @param {string} paymentMethodId - Stripe payment method ID
   * @returns {Promise<Object>} Updated customer
   */
  async setDefaultPaymentMethod(customerId, paymentMethodId) {
    try {
      const customer = await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      return customer;
    } catch (error) {
      throw new Error(`Failed to set default payment method: ${error.message}`);
    }
  }

  /**
   * Create payment intent for a customer
   * @param {string} customerId - Stripe customer ID
   * @param {number} amount - Amount in cents
   * @param {string} currency - Currency code
   * @param {string} paymentMethodId - Payment method ID (optional)
   * @returns {Promise<Object>} Payment intent
   */
  async createPaymentIntent(
    customerId,
    amount,
    currency = "usd",
    paymentMethodId = null
  ) {
    try {
      const paymentIntentData = {
        amount: amount * 100, // Convert to cents
        currency: currency,
        customer: customerId,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
      };

      if (paymentMethodId) {
        paymentIntentData.payment_method = paymentMethodId;
        paymentIntentData.confirmation_method = "manual";
        paymentIntentData.confirm = true;
      }

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentData
      );

      return paymentIntent;
    } catch (error) {
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }
}

module.exports = new StripeService();
