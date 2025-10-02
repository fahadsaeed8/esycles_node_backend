const { Worker } = require("bullmq");
const { AuctionAd, BidHistory, Notification } = require("../models/Ads");

const connection = { host: "127.0.0.1", port: 6379 };

const worker = new Worker(
  "auctionQueue",
  async (job) => {
    if (job.name === "auction-expiry") {
      const { auctionId } = job.data;

      const auction = await AuctionAd.findById(auctionId);
      if (!auction) return;

      // Get all users who placed a bid
      const bids = await BidHistory.find({ auctionAd: auctionId }).populate("user");

      for (const bid of bids) {
        await Notification.create({
          user: bid.user._id,
          auctionId: auction._id,
          title: "Auction Expired",
          text: `The auction "${auction.title}" has expired. Thank you for your participation.`,
          is_read: false,
        });
      }

      console.log(`Notifications sent for auction ${auction._id}`);
    }
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error(`Job failed: ${job.id}`, err);
});
