const Joi = require("joi");

/**
 * Generic validation middleware factory
 * @param {Object} schema - Joi schema object
 * @param {string} source - Source of data to validate ('body', 'params', 'query')
 * @returns {Function} Express middleware function
 */
const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const dataToValidate = req[source];

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all validation errors
      stripUnknown: true, // Remove unknown fields
      allowUnknown: false, // Don't allow unknown fields
    });

    if (error) {
      const errorDetails = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
        value: detail.context?.value,
      }));

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errorDetails,
      });
    }

    // Replace the original data with validated and sanitized data
    req[source] = value;
    next();
  };
};

/**
 * Validate request body
 * @param {Object} schema - Joi schema for body validation
 * @returns {Function} Express middleware function
 */
const validateBody = (schema) => validate(schema, "body");

/**
 * Validate request parameters
 * @param {Object} schema - Joi schema for params validation
 * @returns {Function} Express middleware function
 */
const validateParams = (schema) => validate(schema, "params");

/**
 * Validate query parameters
 * @param {Object} schema - Joi schema for query validation
 * @returns {Function} Express middleware function
 */
const validateQuery = (schema) => validate(schema, "query");

/**
 * Validate multiple sources at once
 * @param {Object} schemas - Object with schema for each source
 * @returns {Function} Express middleware function
 */
const validateMultiple = (schemas) => {
  return (req, res, next) => {
    const errors = [];

    // Validate each source
    Object.keys(schemas).forEach((source) => {
      const schema = schemas[source];
      const dataToValidate = req[source];

      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: false,
      });

      if (error) {
        const errorDetails = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
          value: detail.context?.value,
          source: source,
        }));
        errors.push(...errorDetails);
      } else {
        // Replace the original data with validated and sanitized data
        req[source] = value;
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors,
      });
    }

    next();
  };
};

module.exports = {
  validate,
  validateBody,
  validateParams,
  validateQuery,
  validateMultiple,
};
