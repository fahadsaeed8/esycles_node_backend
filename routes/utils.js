const express = require("express");
const router = express.Router();
const { query, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const UtilModel = require("../models/Utils");
const Country = UtilModel.Country;
const State = UtilModel.State;
const City = UtilModel.City;
const Language = UtilModel.Language;
const Currency = UtilModel.Currency;
const Notification = UtilModel.Notification;
/**
 * @route GET /api/countries
 * @description Get list of all active countries
 * @returns {Object[]} countries - Array of country objects
 */
router.get("/countries", async (req, res) => {
  try {
    const countries = await Country.find({ is_active: true })
      .select("name code phone_code")
      .sort("name");
    res.json({
      success: true,
      data: countries,
    });
  } catch (err) {
    console.error("Countries Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching countries",
    });
  }
});

/**
 * @route GET /api/states
 * @description Get states by country ID
 * @param {string} country.query.required - Country ID
 * @returns {Object[]} states - Array of state objects
 */
router.get(
  "/states",
  [query("country").isMongoId().withMessage("Valid country ID is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const states = await State.find({
        country: req.query.country,
        is_active: true,
      })
        .select("name code")
        .sort("name");

      res.json({
        success: true,
        data: states,
      });
    } catch (err) {
      console.error("States Error:", err);
      res.status(500).json({
        success: false,
        message: "Server error while fetching states",
      });
    }
  }
);

/**
 * @route GET /api/cities
 * @description Get cities by state ID
 * @param {string} state.query.required - State ID
 * @returns {Object[]} cities - Array of city objects
 */
router.get(
  "/cities",
  [query("state").isMongoId().withMessage("Valid state ID is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const cities = await City.find({
        state: req.query.state,
        is_active: true,
      })
        .select("name")
        .sort("name");

      res.json({
        success: true,
        data: cities,
      });
    } catch (err) {
      console.error("Cities Error:", err);
      res.status(500).json({
        success: false,
        message: "Server error while fetching cities",
      });
    }
  }
);

/**
 * @route GET /api/languages
 * @description Get list of all active languages
 * @returns {Object[]} languages - Array of language objects
 */
router.get("/languages", async (req, res) => {
  try {
    const languages = await Language.find({ is_active: true })
      .select("name code")
      .sort("name");
    res.json({
      success: true,
      data: languages,
    });
  } catch (err) {
    console.error("Languages Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching languages",
    });
  }
});

// GET all currencies
router.get("/currencies", async (req, res) => {
  try {
    const currencies = await Currency.find({ is_active: true });
    res.status(200).json({ success: true, data: currencies });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error fetching currencies", error });
  }
});

module.exports = router;
