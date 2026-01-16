const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");

class SellerController {
  // Create a Stripe Express Connect account and return onboarding link
  async createOnboard(req, res) {
    try {
      const userId = req.user._id;
      const { country = "US", type = "express" } = req.body;

      // Allowlist of supported country codes (ISO 3166-1 alpha-2)
      const allowedCountries = new Set([
        "AU",
        "AT",
        "BE",
        "BR",
        "BG",
        "CA",
        "CI",
        "HR",
        "CY",
        "CZ",
        "DK",
        "EE",
        "FI",
        "FR",
        "DE",
        "GH",
        "GI",
        "GR",
        "HK",
        "HU",
        "IN",
        "ID",
        "IE",
        "IT",
        "JP",
        "KE",
        "LV",
        "LI",
        "LT",
        "LU",
        "MY",
        "MT",
        "MX",
        "NL",
        "NZ",
        "NG",
        "NO",
        "PL",
        "PT",
        "RO",
        "SG",
        "SK",
        "SI",
        "ZA",
        "ES",
        "SE",
        "CH",
        "TH",
        "AE",
        "GB",
        "US",
      ]);

      const countryCode = (country || "US").toString().toUpperCase();
      if (!allowedCountries.has(countryCode)) {
        return res.status(400).json({
          error: "Unsupported country",
          allowed_countries: Array.from(allowedCountries).sort(),
        });
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      // Create Express Connect account
      const account = await stripe.accounts.create({
        type,
        country,
        email: user.email,
      });

      // Persist connect account id on user
      user.connect_account_id = account.id;
      await user.save();

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: "https://esycles.com/",
        return_url: "https://esycles.com/",
        type: "account_onboarding",
      });

      res.json({ onboarding_url: accountLink.url, account_id: account.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Retrieve connect account status
  async getAccount(req, res) {
    try {
      const userId = req.user._id;
      const user = await User.findById(userId)
        .select("connect_account_id")
        .lean();
      if (!user || !user.connect_account_id)
        return res.status(404).json({ error: "Connect account not found" });

      const acct = await stripe.accounts.retrieve(user.connect_account_id);
      res.json({ account: acct });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Return simple onboarding status for the authenticated seller
  async onboardingStatus(req, res) {
    try {
      const userId = req.user._id;
      const user = await User.findById(userId)
        .select("connect_account_id")
        .lean();
      if (!user || !user.connect_account_id)
        return res.json({ onboarded: false, reason: "no_connect_account" });

      const acct = await stripe.accounts.retrieve(user.connect_account_id);
      const onboarded =
        !!acct.details_submitted &&
        !!acct.charges_enabled &&
        !!acct.payouts_enabled;

      res.json({
        onboarded,
        account_id: user.connect_account_id,
        details_submitted: !!acct.details_submitted,
        charges_enabled: !!acct.charges_enabled,
        payouts_enabled: !!acct.payouts_enabled,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new SellerController();
