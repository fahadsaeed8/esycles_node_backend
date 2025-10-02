// utils/sendSMS.js
require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const sendSMS = async (to, message) => {
  try {
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`
      },
      body: JSON.stringify({
        from: process.env.TELNYX_PHONE_NUMBER,
        to: to,
        text: message,
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.errors?.[0]?.detail || 'Failed to send SMS');
    }

    const data = await response.json();
    console.log('SMS sent:', data);
    return data;
  } catch (error) {
    console.error('SMS sending failed:', error.message);
    throw error;
  }
};

module.exports = sendSMS;