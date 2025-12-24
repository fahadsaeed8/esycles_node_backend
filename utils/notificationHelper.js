// utils/notificationHelper.js
const { AuctionAd, BidHistory, Notification } = require("../models/Ads");
const mongoose = require("mongoose");
/**
 * @param {String} auctionId - AuctionAd ID
 * @param {String} title - Notification title
 * @param {String} text - Notification text
 * @param {ObjectId} loginUserId - Logged-in user ID (excluded from notification)
 */
async function notifyOtherBidders(auctionId, title, text, loginUserId) {
  try {
    const bidHistories = await BidHistory.find({ auctionAd: auctionId }).select(
      "user"
    );
    console.log({ auctionId, loginUserId });
    const uniqueUsers = [
      ...new Set(bidHistories.map((b) => b.user.toString())),
    ];

    // Exclude login user
    const usersToNotify = uniqueUsers.filter(
      (uid) => uid !== loginUserId.toString()
    );

    // Also notify the seller (ad owner) if they are not the logged-in user
    const auction = await AuctionAd.findById(auctionId).select("user");
    if (auction && auction.user) {
      const sellerId = auction.user.toString();
      if (
        sellerId !== loginUserId.toString() &&
        !usersToNotify.includes(sellerId)
      ) {
        usersToNotify.push(sellerId);
      }
    }

    const auctionObjectId = mongoose.Types.ObjectId.isValid(auctionId)
      ? new mongoose.Types.ObjectId(auctionId)
      : auctionId;

    const notifications = usersToNotify.map((uid) => {
      const userObjectId = mongoose.Types.ObjectId.isValid(uid)
        ? new mongoose.Types.ObjectId(uid)
        : uid;

      return {
        title,
        text,
        userId: userObjectId,
        auctionId: auctionObjectId,
        is_read: false,
        user: userObjectId,
        description: text,
      };
    });

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error("Error creating notifications for bidders:", err);
  }
}

module.exports = { notifyOtherBidders };
