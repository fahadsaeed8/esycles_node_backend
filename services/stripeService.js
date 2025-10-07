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

  async attachPaymentMethod(paymentMethodId, customerId) {
    try {
      const paymentMethod = await stripe.paymentMethods.attach(
        paymentMethodId,
        {
          customer: customerId,
        }
      );

      return paymentMethod;
    } catch (error) {
      throw new Error(`Failed to attach payment method: ${error.message}`);
    }
  }

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

  async detachPaymentMethod(paymentMethodId) {
    try {
      const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);

      return paymentMethod;
    } catch (error) {
      throw new Error(`Failed to detach payment method: ${error.message}`);
    }
  }

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
}

module.exports = new StripeService();
