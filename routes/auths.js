const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const UserOTP = require("../models/UserOTP");
const UtilsModel = require("../models/Utils");
const sendEmail = require("../utils/sendEmail");
const sendSMS = require("../utils/sendSMS");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const auth = require("../middleware/auth");
const Country = UtilsModel.Country;
const State = UtilsModel.State;
const City = UtilsModel.City;
const Language = UtilsModel.Language;
const UserAddress = require("../models/UserAddress");
const { Notification } = require("../models/Ads");

const dotenv = require("dotenv");
const { OpenAI } = require("openai");
dotenv.config();

// Helper function to generate 6-digit OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/**
 * POST /api/signup
 */ // Helper: normalize Gmail/Googlemail emails
function normalizeEmail(email) {
  email = email.toLowerCase().trim();

  if (email.endsWith("@gmail.com") || email.endsWith("@googlemail.com")) {
    const [localPart, domain] = email.split("@");
    const normalizedLocal = localPart.split("+")[0].replace(/\./g, "");
    return `${normalizedLocal}@${domain}`;
  }

  return email;
}

router.post(
  "/signup",
  [
    body("first_name").notEmpty().trim().withMessage("First name is required"),
    body("last_name").notEmpty().trim().withMessage("Last name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("mobile_number")
      .optional()
      .isMobilePhone()
      .withMessage("Valid mobile number is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("confirm_password")
      .custom((value, { req }) => value === req.body.password)
      .withMessage("Passwords do not match"),
    body("role")
      .optional()
      .isIn(["vendor", "customer", "admin", "influencer"])
      .withMessage("Invalid role specified"),

    // Address validation
    body("address.street")
      .if(body("role").equals("vendor"))
      .notEmpty()
      .withMessage("Street address is required"),
    body("address.city")
      .if(body("role").equals("vendor"))
      .isMongoId()
      .withMessage("Valid city ID is required"),
    body("address.state")
      .if(body("role").equals("vendor"))
      .isMongoId()
      .withMessage("Valid state ID is required"),
    body("address.country")
      .if(body("role").equals("vendor"))
      .isMongoId()
      .withMessage("Valid country ID is required"),
    body("address.zip_code")
      .if(body("role").equals("vendor"))
      .notEmpty()
      .withMessage("ZIP code is required"),

    // Vendor-specific validation
    body("company_info.company_name")
      .if(body("role").equals("vendor"))
      .notEmpty()
      .withMessage("Company name is required"),
    body("company_info.title")
      .if(body("role").equals("vendor"))
      .notEmpty()
      .withMessage("Title is required"),
    body("company_info.tax_id").optional().isString(),
    body("company_info.business_registration").optional().isString(),
    body("company_info.website").optional().isURL(),

    // Preferences
    body("language").optional().isMongoId(),
    body("currency").optional().isString(),
    body("receive_updates").optional().isBoolean(),
    body("agreed_to_terms")
      .isBoolean()
      .withMessage("You must agree to the terms"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      first_name,
      last_name,
      email,
      mobile_number,
      password,
      role = "customer",
      address,
      company_info,
      language,
      currency,
      receive_updates = false,
      agreed_to_terms,
    } = req.body;

    try {
      // Normalize email
      const normalizedEmail = normalizeEmail(email);

      // Check if user exists
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res
          .status(400)
          .json({ success: false, message: "Email already registered" });
      }

      // Validate terms agreement
      if (!agreed_to_terms) {
        return res
          .status(400)
          .json({ success: false, message: "Terms agreement is required" });
      }

      // Vendor-specific validation
      if (role === "vendor") {
        const [city, state, country] = await Promise.all([
          City.findById(address.city),
          State.findById(address.state),
          Country.findById(address.country),
        ]);

        if (!city || !state || !country) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid address references" });
        }
      }

      // Create user
      const userData = {
        first_name,
        last_name,
        email: normalizedEmail, // save normalized email
        mobile_number,
        password,
        role,
        address: role === "vendor" ? address : undefined,
        company_info: role === "vendor" ? company_info : undefined,
        language,
        currency,
        receive_updates,
        agreed_to_terms,
      };

      const user = new User(userData);
      await user.save();

      // Generate OTP (dummy for now)
      const otp = generateOTP();
      await UserOTP.create({ email: normalizedEmail, otp });

      // Remove sensitive data from response
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.__v;

      // Send OTP email
      await sendEmail(email, "Your OTP Code", `Your OTP is: ${otp}`);

      return res.status(201).json({
        success: true,
        message: "Registration successful. OTP sent to email.",
        user: userResponse,
      });
    } catch (err) {
      console.error("Registration error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Server error during registration" });
    }
  }
);

/**
 * POST /api/verify-otp
 */
router.post(
  "/verify-otp",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("otp")
      .isLength({ min: 6, max: 6 })
      .withMessage("6-digit OTP is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, otp } = req.body;

    try {
      // Find the latest matching OTP that hasn't been verified
      const otpEntry = await UserOTP.findOne({
        email,
        otp,
        is_verified: false,
      }).sort({ created_at: -1 });

      if (!otpEntry) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid or expired OTP" });
      }

      // Mark OTP as verified
      otpEntry.is_verified = true;
      await otpEntry.save();

      // Activate user
      const user = await User.findOne({ email });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      user.is_active = true;
      await user.save();

      return res.json({
        success: true,
        message: "OTP verified and user activated",
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// POST /api/resend-otp
router.post(
  "/resend-otp",
  [body("email").isEmail().withMessage("Valid email is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      // Generate new OTP
      // const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otp = generateOTP();

      // Optional: Invalidate previous OTPs (soft-delete or mark expired)
      // await UserOTP.updateMany({ email }, { $set: { is_verified: true } });

      // Save new OTP
      await UserOTP.create({ email, otp });

      // Send email
      await sendEmail(email, "Your New OTP Code", `Your new OTP is: ${otp}`);

      res.status(200).json({
        success: true,
        message: "OTP resent successfully",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// POST /api/login
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      if (!user.is_active) {
        return res
          .status(403)
          .json({ success: false, message: "User is not verified yet" });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ success: false, message: "Incorrect password" });
      }

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

      return res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user._id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// GET /api/profile
router.get("/profile", auth, async (req, res) => {
  try {
    const latestNotification = await Notification.findOne({
      userId: req.user._id,
      is_read: false,
    })
      .sort({ createdAt: -1 }) // latest first
      .lean();

    return res.json({
      success: true,
      user: req.user,
      notification: latestNotification || null, // null if none found
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/change-password
router.post(
  "/change-password",
  auth,
  [
    body("current_password")
      .notEmpty()
      .withMessage("Current password is required"),
    body("new_password")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters"),
    body("confirm_new_password")
      .custom((value, { req }) => value === req.body.new_password)
      .withMessage("Confirm password does not match new password"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { current_password, new_password } = req.body;

    try {
      const user = await User.findById(req.user._id);

      const isMatch = await user.comparePassword(current_password);
      if (!isMatch) {
        return res
          .status(400)
          .json({ success: false, message: "Current password is incorrect" });
      }

      // ✅ Directly assign new password (will be hashed in pre-save hook)
      user.password = new_password;
      await user.save();

      return res.json({
        success: true,
        message: "Password updated successfully",
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

router.post(
  "/reset-password",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("otp")
      .isLength({ min: 6, max: 6 })
      .withMessage("6-digit OTP is required"),
    body("new_password")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters"),
    body("confirm_password")
      .custom((value, { req }) => value === req.body.new_password)
      .withMessage("Confirm password does not match new password"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, otp, new_password } = req.body;

    try {
      // Find valid OTP
      const otpEntry = await UserOTP.findOne({
        email,
        otp,
        is_verified: false,
      }).sort({ created_at: -1 });

      if (!otpEntry) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid or expired OTP" });
      }

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      // Set new password (will hash automatically via pre-save)
      user.password = new_password;
      await user.save();

      // Mark OTP as used
      otpEntry.is_verified = true;
      await otpEntry.save();

      return res.json({ success: true, message: "Password reset successful" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

router.post("/send-sms", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: "Phone and message are required" });
  }

  try {
    const result = await sendSMS(phone, message);
    res.status(200).json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: "SMS sending failed", err });
  }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
router.post("/bot/ask", async (req, res) => {
  const { question } = req.body;

  try {
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant for the e-commerce site "Esycles". Only answer questions based on the content, services, or products available at https://esycles.vercel.app. If a question is not related to Esycles, politely respond that you are only trained to answer questions about Esycles.`,
        },
        {
          role: "user",
          content: question,
        },
      ],
      temperature: 0.7,
    });

    res.json({ answer: chatResponse.choices[0].message.content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error communicating with ChatGPT" });
  }
});

router.post("/bot/grammar", async (req, res) => {
  const { text } = req.body;

  try {
    // Split sentence into words
    const words = text.trim().split(/\s+/);

    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a spelling checker.
          I will give you a list of words, and you must return a JSON array.
          For each word, return:
          - "word": original word
          - "correct": true/false
          - "suggestion": correct spelling if wrong, else null.
          Example:
          [{"word":"Ths","correct":false,"suggestion":"This"},
           {"word":"is","correct":true,"suggestion":null}]`,
        },
        {
          role: "user",
          content: JSON.stringify(words),
        },
      ],
      temperature: 0,
    });

    // Parse the AI's JSON response safely
    let result;
    try {
      result = JSON.parse(chatResponse.choices[0].message.content);
    } catch (err) {
      return res.status(500).json({ error: "Invalid JSON returned from AI" });
    }

    res.json({ result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error checking spelling with OpenAI" });
  }
});

// Create Address API
router.post("/billing_address", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      country,
      state,
      city,
      postcode,
      address,
      building,
      label,
      is_default,
    } = req.body;

    // Validate required fields
    if (!country || !state || !city || !postcode || !address) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Verify referenced documents exist
    const [countryExists, stateExists, cityExists] = await Promise.all([
      Country.findById(country),
      State.findById(state),
      City.findById(city),
    ]);

    if (!countryExists || !stateExists || !cityExists) {
      return res
        .status(400)
        .json({ message: "Invalid country, state, or city" });
    }

    // If setting as default, unset any existing default
    if (is_default) {
      await UserAddress.updateMany(
        { user: userId, is_default: true },
        { $set: { is_default: false } }
      );
    }

    // Create new address
    const newAddress = new UserAddress({
      user: userId,
      country,
      state,
      city,
      postcode,
      address,
      building,
      label: label || "home",
      is_default: is_default || false,
    });

    await newAddress.save();

    // Populate the references in the response
    const populatedAddress = await UserAddress.findById(newAddress._id)
      .populate("country", "name")
      .populate("state", "name")
      .populate("city", "name");

    res.status(201).json({
      message: "Address created successfully",
      address: populatedAddress,
    });
  } catch (error) {
    console.error("Error creating address:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get User Addresses API
router.get("/addresses", auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const addresses = await UserAddress.find({ user: userId })
      .populate("country", "name")
      .populate("state", "name")
      .populate("city", "name")
      .sort({ is_default: -1, createdAt: -1 });

    res.status(200).json({
      message: "Addresses retrieved successfully",
      addresses,
      default_address: addresses.find((addr) => addr.is_default) || null,
    });
  } catch (error) {
    console.error("Error getting addresses:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
