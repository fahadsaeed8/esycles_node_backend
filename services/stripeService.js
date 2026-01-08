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

  // List payment methods with an optional type (e.g., "card" or "us_bank_account")
  async listCustomerPaymentMethods(customerId, type = "card") {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type,
      });

      return paymentMethods.data;
    } catch (error) {
      throw new Error(`Failed to list payment methods: ${error.message}`);
    }
  }

  // Create a SetupIntent for linking a US bank account (us_bank_account)
  async createSetupIntent(customerId) {
    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["us_bank_account"],
        usage: "off_session",
      });

      return setupIntent;
    } catch (error) {
      throw new Error(`Failed to create SetupIntent: ${error.message}`);
    }
  }

  // Create an ACH PaymentIntent (off_session). Pass paymentMethodId if available to confirm immediately.
  async createACHPaymentIntent({
    customerId,
    amount,
    currency = "usd",
    paymentMethodId,
    verificationMethod = "microdeposits",
  }) {
    try {
      const payload = {
        amount,
        currency,
        customer: customerId,
        payment_method_types: ["us_bank_account"],
        payment_method_options: {
          us_bank_account: {
            verification_method: verificationMethod,
          },
        },
        off_session: true,
        confirm: !!paymentMethodId,
      };

      if (paymentMethodId) {
        payload.payment_method = paymentMethodId;
      }

      const paymentIntent = await stripe.paymentIntents.create(payload);
      return paymentIntent;
    } catch (error) {
      throw new Error(`Failed to create ACH PaymentIntent: ${error.message}`);
    }
  }

  // Create a PaymentIntent intended for digital wallets (Apple Pay, Google Pay).
  // The frontend will use the returned client_secret with Stripe.js Payment Request / PaymentElement.
  async createWalletPaymentIntent({
    customerId,
    amount,
    currency = "usd",
    metadata = {},
  }) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        customer: customerId,
        payment_method_types: ["card"],
        automatic_payment_methods: { enabled: true },
        metadata,
      });

      return paymentIntent;
    } catch (error) {
      throw new Error(
        `Failed to create wallet PaymentIntent: ${error.message}`
      );
    }
  }

  // Verify micro-deposits for a given PaymentMethod (amounts in cents)
  async verifyMicrodeposits(paymentMethodId, amounts) {
    try {
      // amounts should be an array of integers (in cents)
      const verification = await stripe.paymentMethods.verify(paymentMethodId, {
        amounts,
      });

      return verification;
    } catch (error) {
      throw new Error(`Failed to verify microdeposits: ${error.message}`);
    }
  }

  // Create a Financial Connections session for instant bank verification (Stripe Link)
  async createFinancialConnectionsSession(customerId) {
    try {
      const session = await stripe.financialConnections.sessions.create({
        account_holder: { type: "customer", customer: customerId },
        permissions: ["payment_method"],
      });

      return session;
    } catch (error) {
      throw new Error(
        `Failed to create Financial Connections session: ${error.message}`
      );
    }
  }

  // Create a PaymentMethod from a Financial Connections account and attach to customer
  async createPaymentMethodFromFinancialAccount(
    financialConnectionsAccountId,
    customerId
  ) {
    try {
      // Create payment method using the financial_connections_account
      const pm = await stripe.paymentMethods.create({
        type: "us_bank_account",
        us_bank_account: {
          financial_connections_account: financialConnectionsAccountId,
        },
      });

      // Attach to customer
      await stripe.paymentMethods.attach(pm.id, { customer: customerId });

      return pm;
    } catch (error) {
      throw new Error(
        `Failed to create PaymentMethod from Financial Connections account: ${error.message}`
      );
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
