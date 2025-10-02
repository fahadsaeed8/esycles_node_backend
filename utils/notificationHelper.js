// utils/notificationHelper.js
const { AuctionAd, BidHistory, Notification } = require("../models/Ads");

/**
 * @param {String} auctionId - AuctionAd ID
 * @param {String} title - Notification title
 * @param {String} text - Notification text
 * @param {ObjectId} loginUserId - Logged-in user ID (excluded from notification)
 */
async function notifyOtherBidders(auctionId, title, text, loginUserId) {
  try {
    const bidHistories = await BidHistory.find({ auctionAd: auctionId }).select("user");

    const uniqueUsers = [...new Set(bidHistories.map(b => b.user.toString()))];

    // Exclude login user
    const usersToNotify = uniqueUsers.filter(uid => uid !== loginUserId.toString());

    const notifications = usersToNotify.map(uid => ({
      title,
      text,
      userId: uid,
      auctionId,
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error("Error creating notifications for bidders:", err);
  }
}

module.exports = { notifyOtherBidders };
