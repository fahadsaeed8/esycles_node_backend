const Joi = require("joi");

// Common validation schemas
const cardNumberSchema = Joi.string()
  .pattern(/^\d{13,19}$/)
  .required()
  .messages({
    "string.pattern.base": "Card number must be between 13-19 digits",
    "any.required": "Card number is required",
  });

const cardHolderNameSchema = Joi.string()
  .trim()
  .min(1)
  .max(100)
  .required()
  .messages({
    "string.min": "Card holder name cannot be empty",
    "string.max": "Card holder name must be less than 100 characters",
    "any.required": "Card holder name is required",
  });

const cardTypeSchema = Joi.string()
  .valid("visa", "mastercard", "amex", "discover", "jcb", "diners", "other")
  .optional()
  .messages({
    "any.only":
      "Card type must be one of: visa, mastercard, amex, discover, jcb, diners, other",
  });

const expiryMonthSchema = Joi.number()
  .integer()
  .min(1)
  .max(12)
  .required()
  .messages({
    "number.base": "Expiry month must be a number",
    "number.integer": "Expiry month must be an integer",
    "number.min": "Expiry month must be between 1 and 12",
    "number.max": "Expiry month must be between 1 and 12",
    "any.required": "Expiry month is required",
  });

const expiryYearSchema = Joi.number()
  .integer()
  .min(new Date().getFullYear())
  .required()
  .messages({
    "number.base": "Expiry year must be a number",
    "number.integer": "Expiry year must be an integer",
    "number.min": "Expiry year must be current year or later",
    "any.required": "Expiry year is required",
  });

const mongoIdSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .required()
  .messages({
    "string.pattern.base": "Invalid card ID format",
    "any.required": "Card ID is required",
  });

// Validation schemas for different endpoints
const addPaymentCardSchema = Joi.object({
  payment_method_id: Joi.string()
    .pattern(/^pm_[a-zA-Z0-9_]+$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid payment method ID format",
      "any.required": "Payment method ID is required",
    }),
});

const updatePaymentCardSchema = Joi.object({
  card_holder_name: cardHolderNameSchema.optional(),
  email: Joi.string().email().optional().messages({
    "string.email": "Please provide a valid email address",
  }),
}).min(1); // At least one field must be provided for update

const validateCardNumberSchema = Joi.object({
  card_number: cardNumberSchema,
});

const cardIdParamSchema = Joi.object({
  id: mongoIdSchema,
});

// Export validation schemas
module.exports = {
  addPaymentCardSchema,
  updatePaymentCardSchema,
  validateCardNumberSchema,
  cardIdParamSchema,
};
