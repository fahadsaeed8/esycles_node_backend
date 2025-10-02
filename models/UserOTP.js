const mongoose = require('mongoose');

const userOTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  is_verified: { type: Boolean, default: false },
  created_at: {
    type: Date,
    default: Date.now,
    expires: 300
  }
});

module.exports = mongoose.model('UserOTP', userOTPSchema);
