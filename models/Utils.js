// models/Utils.js
const mongoose = require('mongoose');

// Country Schema
const countrySchema = new mongoose.Schema({
  name: String,
  code: String,
  phone_code: String,
  is_active: Boolean
});
const Country = mongoose.model('Country', countrySchema);

// State Schema
const stateSchema = new mongoose.Schema({
  name: String,
  code: String,
  country: { type: mongoose.Schema.Types.ObjectId, ref: 'Country' },
  is_active: Boolean
});
const State = mongoose.model('State', stateSchema);

// City Schema
const citySchema = new mongoose.Schema({
  name: String,
  state: { type: mongoose.Schema.Types.ObjectId, ref: 'State' },
  country: { type: mongoose.Schema.Types.ObjectId, ref: 'Country' },
  is_active: Boolean
});
const City = mongoose.model('City', citySchema);

// Language Schema
const languageSchema = new mongoose.Schema({
  name: String,
  code: String,
  is_active: Boolean
});
const Language = mongoose.model('Language', languageSchema);

const currencySchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  code: { type: String, required: true }, 
  symbol: { type: String, required: true },
  is_active: { type: Boolean, default: true }
});
const Currency = mongoose.model('Currency', currencySchema);

const NotificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // who receives notification
    title: { type: String, required: true },
    description: { type: String, required: true },
    is_read: { type: Boolean, default: false } // track read/unread
  },
  { timestamps: true }
);
const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = {
  Country,
  State,
  City,
  Language,
  Currency,
  Notification
};