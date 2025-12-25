const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const {
  ClassifiedAd,
  AuctionAd,
  MapAd,
  adDuration,
  savedAuctionAd,
  savedClassifiedAd,
  savedMapAd,
  AdReport,
  BidHistory,
  Notification,
} = require("../models/Ads");
const auth = require("../middleware/auth");
const adsUpload = require("../middleware/adsUpload");
const { notifyOtherBidders } = require("../utils/notificationHelper");
const auctionQueue = require("../jobs/auctionQueue");
const sendEmail = require("../utils/sendEmail");

router.post("/classified-ads", auth, adsUpload, async (req, res) => {
  try {
    // get file paths/urls from multer
    const imagePaths = req.files.map((file) => file.path);

    // Prepare data
    let classifiedAdData = {
      ...req.body,
      images: imagePaths,
      user: req.user._id,
    };

    // If status = Published
    if (req.body.status === "Published") {
      const now = new Date();
      const adLife = req.body.adLife ? Number(req.body.adLife) : 7;

      classifiedAdData.adLife = adLife;
      classifiedAdData.startDate = now;

      // expiry = startDate + adLife days
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + adLife);

      classifiedAdData.expiryDate = expiry;
    }

    const classifiedAd = new ClassifiedAd(classifiedAdData);
    await classifiedAd.save();

    res.status(201).json({
      success: true,
      message: "Classified Ad created successfully",
      data: classifiedAd,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch("/classified-ads/:id", auth, adsUpload, async (req, res) => {
  try {
    const { id } = req.params;

    // get file paths/urls from multer if files are uploaded
    let imagePaths = req.files?.map((file) => file.path) || [];

    // find the classified ad
    let classifiedAd = await ClassifiedAd.findById(id);
    if (!classifiedAd) {
      return res.status(404).json({
        success: false,
        message: "Classified Ad not found",
      });
    }

    // update fields dynamically
    Object.keys(req.body).forEach((key) => {
      classifiedAd[key] = req.body[key];
    });

    // if new images are uploaded, merge them with existing ones
    if (imagePaths.length > 0) {
      classifiedAd.images = [...classifiedAd.images, ...imagePaths];
    }

    // If status = Published, recalc adLife + expiryDate
    if (req.body.status === "Published") {
      const now = new Date();
      const adLife = req.body.adLife
        ? Number(req.body.adLife)
        : classifiedAd.adLife || 7;

      classifiedAd.adLife = adLife;
      classifiedAd.startDate = now;

      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + adLife);

      classifiedAd.expiryDate = expiry;
    }

    await classifiedAd.save();

    res.status(200).json({
      success: true,
      message: "Classified Ad updated successfully",
      data: classifiedAd,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

router.patch("/update-classified-ads/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { statics } = req.body;

    // find ad
    let classifiedAd = await ClassifiedAd.findById(id);
    if (!classifiedAd) {
      return res.status(404).json({
        success: false,
        message: "Classified Ad not found",
      });
    }

    // increment counters
    if (statics === "view") {
      classifiedAd.views = (classifiedAd.views || 0) + 1;
    } else if (statics === "phone") {
      classifiedAd.calls = (classifiedAd.calls || 0) + 1;
    }

    await classifiedAd.save();

    res.status(200).json({
      success: true,
      message: "Ad statistics updated successfully",
      data: {
        views: classifiedAd.views,
        calls: classifiedAd.calls,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Pause ads by user / approve ads by admin
router.patch("/pause-approve-classified-ad/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { ad_status, is_pause } = req.body;

    // Validate: only one field can be updated at a time
    if (
      (ad_status && typeof is_pause !== "undefined") ||
      (!ad_status && typeof is_pause === "undefined")
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide only one field: either ad_status or is_pause",
      });
    }

    // Prepare update object
    const updateData = {};
    if (ad_status) {
      if (!["Pending", "Accepted", "Rejected"].includes(ad_status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ad_status value",
        });
      }
      updateData.ad_status = ad_status;
    }
    if (typeof is_pause !== "undefined") {
      updateData.is_pause = is_pause;
    }

    const updatedAd = await ClassifiedAd.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    if (!updatedAd) {
      return res.status(404).json({
        success: false,
        message: "Classified Ad not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Classified Ad updated successfully",
      data: updatedAd,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/classified-ads", auth, async (req, res) => {
  try {
    const {
      status,
      category,
      sellerType,
      location,
      condition,
      adPackageType,
      minPrice,
      maxPrice,
      ad_status, // <-- new filter
    } = req.query;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "Status filter is required" });
    }

    const filters = {
      status,
      is_pause: false, // 🔑 Always fetch ads where is_pause = false
    };

    if (category) filters.category = category;
    if (sellerType) filters.sellerType = sellerType;
    if (location) filters.location = { $regex: location, $options: "i" };
    if (condition) filters.condition = condition;
    if (adPackageType) filters.adPackageType = adPackageType;
    if (minPrice || maxPrice) {
      filters.price = {};
      if (minPrice) filters.price.$gte = Number(minPrice);
      if (maxPrice) filters.price.$lte = Number(maxPrice);
    }

    // 🔑 Only get non-expired ads
    filters.expiryDate = { $gte: new Date() };

    // 🔑 Apply ad_status filter if provided
    if (ad_status) {
      filters.ad_status = ad_status;
    }

    const classifiedAds = await ClassifiedAd.find(filters);

    // get saved classified ads by user
    const savedClassifiedIds = (
      await savedClassifiedAd
        .find({ user: req.user._id })
        .distinct("classifiedAd")
    ).map((id) => id.toString()); // convert all to string

    const fullUrl = req.protocol + "://" + req.get("host");

    const adsWithFullImages = classifiedAds.map((ad) => {
      return {
        ...ad.toObject(),
        images: ad.images.map((img) => `${fullUrl}/${img}`),
        is_saved: savedClassifiedIds.includes(ad._id.toString()),
        adType: "classified",
      };
    });

    res.status(200).json({
      success: true,
      total: adsWithFullImages.length,
      data: adsWithFullImages,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/classified-ad/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // find classified ad by ID
    const classifiedAd = await ClassifiedAd.findById(id);
    if (!classifiedAd) {
      return res
        .status(404)
        .json({ success: false, message: "No classified ad found" });
    }

    // get saved classified ads by user
    const savedClassifiedIds = (
      await savedClassifiedAd
        .find({ user: req.user._id })
        .distinct("classifiedAd")
    ).map((id) => id.toString());

    const fullUrl = req.protocol + "://" + req.get("host");

    // build response with full image URLs + saved flag
    const adWithFullImages = {
      ...classifiedAd.toObject(),
      images: classifiedAd.images.map((img) => `${fullUrl}/${img}`),
      is_saved: savedClassifiedIds.includes(classifiedAd._id.toString()),
    };

    res.status(200).json({
      success: true,
      data: adWithFullImages,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// 🔧 Helper function (no extra filters)
async function getClassifiedAds(req, res, boostField) {
  try {
    // 🔑 Base filters: Published, not expired, boosted field
    const filters = {
      status: "Published",
      ad_status: "Accepted",
      expiryDate: { $gte: new Date() },
      [boostField]: true, // e.g. is_promoted or is_featured
    };

    const classifiedAds = await ClassifiedAd.find(filters);

    // ✅ saved ads by user
    const savedClassifiedIds = (
      await savedClassifiedAd
        .find({ user: req.user._id })
        .distinct("classifiedAd")
    ).map((id) => id.toString());

    const fullUrl = `${req.protocol}://${req.get("host")}`;

    const adsWithFullImages = classifiedAds.map((ad) => ({
      ...ad.toObject(),
      images: ad.images.map((img) => `${fullUrl}/${img}`),
      is_saved: savedClassifiedIds.includes(ad._id.toString()),
      adType: "classified",
    }));

    res.status(200).json({
      success: true,
      total: adsWithFullImages.length,
      data: adsWithFullImages,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

// Routes
router.get("/promoted-classified-ads", auth, (req, res) =>
  getClassifiedAds(req, res, "is_promoted")
);

router.get("/featured-classified-ads", auth, (req, res) =>
  getClassifiedAds(req, res, "is_featured")
);

// here "images" should match your Postman key
router.post("/auction-ads", auth, adsUpload, async (req, res) => {
  try {
    const imagePaths = req.files ? req.files.map((file) => file.path) : [];

    const auctionAd = new AuctionAd({
      ...req.body,
      images: imagePaths,
      user: req.user._id,
    });

    if (req.body.status === "Published") {
      const now = new Date();
      const adLife = req.body.adLife ? Number(req.body.adLife) : 7;

      auctionAd.adLife = adLife;
      auctionAd.startDate = now;

      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + adLife);

      auctionAd.expiryDate = expiry;
    }

    await auctionAd.save();

    res.status(201).json({
      success: true,
      message: "Auction Ad created successfully",
      data: auctionAd,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PATCH Auction Ad
router.patch("/auction-ads/:id", auth, adsUpload, async (req, res) => {
  try {
    const { id } = req.params;

    // get uploaded images if any
    const imagePaths = req.files ? req.files.map((file) => file.path) : [];

    // find the auction ad
    let auctionAd = await AuctionAd.findById(id);
    if (!auctionAd) {
      return res.status(404).json({
        success: false,
        message: "Auction Ad not found",
      });
    }

    // update fields dynamically from req.body
    Object.keys(req.body).forEach((key) => {
      auctionAd[key] = req.body[key];
    });

    // if new images uploaded, merge them
    if (imagePaths.length > 0) {
      auctionAd.images = [...auctionAd.images, ...imagePaths];
    }

    // handle status = Published
    if (req.body.status === "Published") {
      const now = new Date();
      const adLife = req.body.adLife
        ? Number(req.body.adLife)
        : auctionAd.adLife || 7;

      auctionAd.adLife = adLife;
      auctionAd.startDate = now;

      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + adLife);

      auctionAd.expiryDate = expiry;
    }

    await auctionAd.save();

    res.status(200).json({
      success: true,
      message: "Auction Ad updated successfully",
      data: auctionAd,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

router.patch("/update-auction-ads/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { statics } = req.body;

    // find auction ad
    let auctionAd = await AuctionAd.findById(id);
    if (!auctionAd) {
      return res.status(404).json({
        success: false,
        message: "Auction Ad not found",
      });
    }

    // increment counters
    if (statics === "view") {
      auctionAd.views = (auctionAd.views || 0) + 1;
    } else if (statics === "phone") {
      auctionAd.calls = (auctionAd.calls || 0) + 1;
    }

    await auctionAd.save();

    res.status(200).json({
      success: true,
      message: "Auction Ad statistics updated successfully",
      data: {
        views: auctionAd.views,
        calls: auctionAd.calls,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Auction Ads API with ad_status and is_pause filter
router.get("/auction-ads", auth, async (req, res) => {
  try {
    const {
      status,
      category,
      sellerType,
      location,
      condition,
      auctionType,
      minBid,
      maxBid,
      ad_status,
    } = req.query;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "Status filter is required" });
    }

    // base filters
    const filters = {
      status,
      is_pause: false, // ✅ always exclude paused ads
    };

    if (category) filters.category = category;
    if (sellerType) filters.sellerType = sellerType;
    if (location) filters.location = { $regex: location, $options: "i" };
    if (condition) filters.condition = condition;
    if (auctionType) filters.auctionType = auctionType;

    if (minBid || maxBid) {
      filters.minimumBid = {};
      if (minBid) filters.minimumBid.$gte = Number(minBid);
      if (maxBid) filters.minimumBid.$lte = Number(maxBid);
    }

    // 🔑 Only include active (non-expired) ads
    filters.expiryDate = { $gte: new Date() };

    // ✅ Filter by ad_status if provided
    if (ad_status) {
      filters.ad_status = ad_status;
    }

    const auctionAds = await AuctionAd.find(filters);

    // get saved ads by user
    const savedAuctionIds = (
      await savedAuctionAd.find({ user: req.user._id }).distinct("auctionAd")
    ).map((id) => id.toString()); // convert all to string

    const fullUrl = req.protocol + "://" + req.get("host");

    const adsWithFullImages = auctionAds.map((ad) => {
      return {
        ...ad.toObject(),
        images: ad.images.map((img) => `${fullUrl}/${img}`),
        is_saved: savedAuctionIds.includes(ad._id.toString()),
        adType: "auction",
      };
    });

    res.status(200).json({
      success: true,
      total: adsWithFullImages.length,
      data: adsWithFullImages,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/auction-ad/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // find auction ad by ID and populate necessary fields
    const auctionAd = await AuctionAd.findById(id)
      .populate({
        path: "currentHighestBidder",
        select: "first_name last_name email mobile_number role company_info",
      })
      .populate("user", "first_name last_name email mobile_number role");

    if (!auctionAd) {
      return res
        .status(404)
        .json({ success: false, message: "No auction ad found" });
    }

    // get saved auction ads by user
    const savedAuctionIds = (
      await savedAuctionAd.find({ user: req.user._id }).distinct("auctionAd")
    ).map((id) => id.toString());

    const fullUrl = req.protocol + "://" + req.get("host");

    // Helper function to format user object
    const formatUser = (user) => {
      if (!user) return null;
      return {
        _id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        mobile_number: user.mobile_number,
        role: user.role,
        ...(user.role === "vendor" && {
          company_info: user.company_info,
        }),
      };
    };

    // total bids count
    const count = await BidHistory.countDocuments({ auctionAd: id });

    // fetch all bids for this auction, sorted
    const bids = await BidHistory.find({ auctionAd: id })
      .sort({ currentPlacedAmount: -1 })
      .lean();

    // assign rank
    const rankedBids = bids.map((bid, index) => {
      let rank;
      if (index === 0) {
        rank = "Leading";
      } else if (index === 1) {
        rank = "Runner-up";
      } else {
        rank = `Rank ${index + 1}`;
      }
      return { ...bid, rank };
    });

    // find logged-in user's bid rank
    const userBid = rankedBids.find(
      (bid) => bid.user.toString() === req.user._id.toString()
    );
    const userRank = userBid ? userBid.rank : null;

    // build response
    const responseData = {
      ...auctionAd.toObject(),
      images: auctionAd.images.map((img) => `${fullUrl}/${img}`),
      is_saved: savedAuctionIds.includes(auctionAd._id.toString()),
      bidIncrement: count,
      currentHighestBidder: formatUser(auctionAd.currentHighestBidder),
      user_rank: userRank,
      user: formatUser(auctionAd.user),
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET top bids for an auction
router.get("/auction-ad/:id/top-bids", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // First, check if there’s an accepted bid
    const acceptedBid = await BidHistory.findOne({
      auctionAd: id,
      offer_status: "Accepted",
    })
      .populate("user", "first_name last_name email mobile_number")
      .lean();

    if (acceptedBid) {
      // If accepted bid exists, return just that one
      return res.status(200).json({
        success: true,
        data: {
          auctionAd: acceptedBid.auctionAd,
          bidAmount: acceptedBid.currentPlacedAmount,
          user: acceptedBid.user,
          bidId: acceptedBid._id,
          createdAt: acceptedBid.createdAt,
          rank: "Winner", // you can keep this static if it's accepted
        },
      });
    }

    // Otherwise, fetch top 3 pending/offered bids
    const topBids = await BidHistory.find({
      auctionAd: id,
      offer_status: { $in: ["Pending", "Offered"] },
    })
      .sort({ currentPlacedAmount: -1 }) // highest first
      .limit(3)
      .populate("user", "first_name last_name email mobile_number")
      .lean();

    if (!topBids.length) {
      return res.status(404).json({
        success: false,
        message: "No pending/offered bids found for this auction",
      });
    }

    // Add rank labels
    const rankLabels = ["Leading", "Runner-up", "Third Place"];

    return res.status(200).json({
      success: true,
      data: topBids.map((bid, index) => ({
        auctionAd: bid.auctionAd,
        bidAmount: bid.currentPlacedAmount,
        offerStatus: bid.offer_status,
        user: bid.user,
        bidId: bid._id,
        createdAt: bid.createdAt,
        rank: rankLabels[index] || `Rank ${index + 1}`,
      })),
    });
  } catch (error) {
    console.error("Error fetching top bids:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Pause ads by user / approve ads by admin
router.patch("/pause-approve-auction-ad/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { ad_status, is_pause } = req.body;

    // Validate: only one field allowed at a time
    if (
      (ad_status && typeof is_pause !== "undefined") ||
      (!ad_status && typeof is_pause === "undefined")
    ) {
      return res.status(400).json({
        success: false,
        message: "Something Wrong, Fields missing!",
      });
    }

    // Prepare update object
    const updateData = {};
    if (ad_status) {
      if (!["Pending", "Accepted", "Rejected"].includes(ad_status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ad_status value",
        });
      }
      updateData.ad_status = ad_status;
    }
    if (typeof is_pause !== "undefined") {
      updateData.is_pause = is_pause;
    }

    const updatedAd = await AuctionAd.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    if (!updatedAd) {
      return res
        .status(404)
        .json({ success: false, message: "No auction ad found" });
    }

    // Schedule expiry job only when admin accepts the ad
    if (updatedAd.expiryDate && ad_status === "Accepted") {
      await auctionQueue.add(
        "auction-expiry",
        { auctionId: updatedAd._id },
        { delay: new Date(updatedAd.expiryDate).getTime() - Date.now() }
      );
    }

    res.status(200).json({
      success: true,
      message: "Auction ad updated successfully",
      data: updatedAd,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Helper function to calculate winning bid
function calculateWinningBid(activeBids, increment, startingBid) {
  if (!activeBids || activeBids.length === 0) {
    return null;
  }

  const validBids = activeBids.filter((bid) => bid.status !== "Cancelled");
  validBids.sort((a, b) => b.maxBidAmount - a.maxBidAmount);

  const highest = validBids[0];

  if (validBids.length === 1) {
    return {
      bidId: highest._id,
      userId: highest.user,
      amount: Math.max(startingBid, highest.currentPlacedAmount),
    };
  }

  const secondHighest = validBids[1];
  let winningAmount = Math.max(
    startingBid,
    Math.min(highest.maxBidAmount, secondHighest.maxBidAmount + increment)
  );

  return {
    bidId: highest._id,
    userId: highest.user,
    amount: winningAmount,
  };
}

// Place bid (manual or automatic)
router.post("/auction-ad/:id/bid", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { price, maxBidAmount, bidType } = req.body;

    // Validation
    if (!price || price <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bid price",
      });
    }

    if (bidType === "Automatic") {
      if (!maxBidAmount) {
        return res.status(400).json({
          success: false,
          message: "Max bid amount is required for automatic bids",
        });
      }

      if (maxBidAmount < price) {
        const nextValidMaxBid = price;
        return res.status(400).json({
          success: false,
          message: `Max bid amount ($${maxBidAmount}) must be greater than or equal to your initial bid amount ($${price}). Please set your max bid to at least $${nextValidMaxBid}`,
        });
      }
    }

    // Fetch auctionAd
    const auction = await AuctionAd.findById(id);
    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction Ad not found",
      });
    }

    // Auction validation
    if (Date.now() > new Date(auction.expiryDate)) {
      return res.status(400).json({
        success: false,
        message: "Auction has already ended",
      });
    }

    if (auction.is_pause) {
      return res.status(400).json({
        success: false,
        message: "Auction is currently paused",
      });
    }

    // NEW VALIDATION: Check if bid is less than minimumBid
    if (auction.minimumBid && price < auction.minimumBid) {
      return res.status(400).json({
        success: false,
        message: `Bid cannot be less than minimum bid. Bidding starts from $${auction.minimumBid}`,
      });
    }

    // Calculate next valid bid
    const nextValidBid = Math.max(
      auction.currentHighestAmount + (auction.bidIncrement || 1),
      auction.startingBid || auction.minimumBid || 1
    );

    if (price < nextValidBid) {
      return res.status(400).json({
        success: false,
        message: `Your bid ($${price}) is too low. Next valid bid is $${nextValidBid}`,
        nextValidBid,
      });
    }

    // Check if user is already the highest bidder
    if (
      auction.currentHighestBidder &&
      auction.currentHighestBidder.toString() === req.user._id.toString()
    ) {
      return res.status(400).json({
        success: false,
        message: "You are already the highest bidder",
      });
    }

    // Create new bid
    const bid = await BidHistory.create({
      auctionAd: id,
      user: req.user._id,
      bidType: bidType || "Manual",
      currentPlacedAmount: price,
      maxBidAmount: bidType === "Automatic" ? maxBidAmount : price,
      status: "Leading",
    });

    // Fetch all active bids for this auction
    const activeBids = await BidHistory.find({
      auctionAd: id,
      status: { $in: ["Leading", "Outbid"] },
    });

    // Use the helper function to calculate winning bid
    const winningBid = calculateWinningBid(
      activeBids,
      auction.bidIncrement || 1,
      auction.startingBid || auction.minimumBid || 1 // Updated to include minimumBid
    );

    if (!winningBid) {
      return res.status(400).json({
        success: false,
        message: "Failed to determine winning bid",
      });
    }

    // Update all leading bids to Outbid first
    await BidHistory.updateMany(
      {
        auctionAd: id,
        status: "Leading",
        _id: { $ne: winningBid.bidId }, // Don't update the winning bid
      },
      { status: "Outbid" }
    );

    // Update auction with winning bid
    auction.currentHighestAmount = winningBid.amount;
    auction.currentHighestBidder = winningBid.userId;
    await auction.save();

    // Mark winner's bid as Leading and update current placed amount
    await BidHistory.findByIdAndUpdate(winningBid.bidId, {
      status: "Leading",
      currentPlacedAmount: winningBid.amount,
    });

    await notifyOtherBidders(
      id,
      "Your bid is now in run-up",
      `Your bid on auction "${auction?.title}" is now in run-up. Place your new bid!`,
      req.user._id
    );

    return res.status(201).json({
      success: true,
      message: "Bid placed successfully",
      data: {
        auctionId: auction._id,
        currentHighestAmount: winningBid.amount,
        currentHighestBidder: winningBid.userId,
        isLeading: winningBid.userId.toString() === req.user._id.toString(),
        yourBidType: bidType || "Manual",
        minimumBid: auction.minimumBid,
      },
    });
  } catch (error) {
    console.error("Bid Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

async function getAuctionAds(req, res, boostField) {
  try {
    const filters = {
      status: "Published",
      ad_status: "Accepted",
      expiryDate: { $gte: new Date() },
      [boostField]: true, // dynamic field (e.g. boostOptions.featureInTopListings)
    };

    const auctionAds = await AuctionAd.find(filters);

    const savedAuctionIds = (
      await savedAuctionAd.find({ user: req.user._id }).distinct("auctionAd")
    ).map((id) => id.toString());

    const fullUrl = `${req.protocol}://${req.get("host")}`;

    const adsWithFullImages = auctionAds.map((ad) => ({
      ...ad.toObject(),
      images: ad.images.map((img) => `${fullUrl}/${img}`),
      is_saved: savedAuctionIds.includes(ad._id.toString()),
      adType: "auction",
    }));

    res.status(200).json({
      success: true,
      total: adsWithFullImages.length,
      data: adsWithFullImages,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

// Routes
router.get("/featured-auction-ads", auth, (req, res) =>
  getAuctionAds(req, res, "boostOptions.featureInTopListings")
);

router.get("/promoted-auction-ads", auth, (req, res) =>
  getAuctionAds(req, res, "boostOptions.promoteHomepage")
);

// ========================= MAP ADS APIS =========================

// POST - Create Map Ad
router.post("/map-ads", auth, adsUpload, async (req, res) => {
  try {
    // Get file paths/urls from multer
    const imagePaths = req.files ? req.files.map((file) => file.path) : [];

    // Validate required location fields
    if (!req.body.latitude || !req.body.longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required for map ads",
      });
    }

    // Prepare data
    let mapAdData = {
      ...req.body,
      images: imagePaths,
      user: req.user._id,
    };

    // If status = Published
    if (req.body.status === "Published") {
      const now = new Date();
      const adLife = req.body.adLife ? Number(req.body.adLife) : 7;

      mapAdData.adLife = adLife;
      mapAdData.startDate = now;

      // expiry = startDate + adLife days
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + adLife);

      mapAdData.expiryDate = expiry;
    }

    const mapAd = new MapAd(mapAdData);
    await mapAd.save();

    res.status(201).json({
      success: true,
      message: "Map Ad created successfully",
      data: mapAd,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PATCH - Update Map Ad
router.patch("/map-ads/:id", auth, adsUpload, async (req, res) => {
  try {
    const { id } = req.params;

    // Get file paths/urls from multer if files are uploaded
    let imagePaths = req.files?.map((file) => file.path) || [];

    // Find the map ad
    let mapAd = await MapAd.findById(id);
    if (!mapAd) {
      return res.status(404).json({
        success: false,
        message: "Map Ad not found",
      });
    }

    // Update fields dynamically
    Object.keys(req.body).forEach((key) => {
      mapAd[key] = req.body[key];
    });

    // If new images are uploaded, merge them with existing ones
    if (imagePaths.length > 0) {
      mapAd.images = [...mapAd.images, ...imagePaths];
    }

    // If status = Published, recalc adLife + expiryDate
    if (req.body.status === "Published") {
      const now = new Date();
      const adLife = req.body.adLife
        ? Number(req.body.adLife)
        : mapAd.adLife || 7;

      mapAd.adLife = adLife;
      mapAd.startDate = now;

      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + adLife);

      mapAd.expiryDate = expiry;
    }

    await mapAd.save();

    res.status(200).json({
      success: true,
      message: "Map Ad updated successfully",
      data: mapAd,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// PATCH - Update Map Ad Statistics (views/calls)
router.patch("/update-map-ads/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { statics } = req.body;

    // Find map ad
    let mapAd = await MapAd.findById(id);
    if (!mapAd) {
      return res.status(404).json({
        success: false,
        message: "Map Ad not found",
      });
    }

    // Increment counters
    if (statics === "view") {
      mapAd.views = (mapAd.views || 0) + 1;
    } else if (statics === "phone") {
      mapAd.calls = (mapAd.calls || 0) + 1;
    }

    await mapAd.save();

    res.status(200).json({
      success: true,
      message: "Map Ad statistics updated successfully",
      data: {
        views: mapAd.views,
        calls: mapAd.calls,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// PATCH - Pause/Approve Map Ad
router.patch("/pause-approve-map-ad/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { ad_status, is_pause } = req.body;

    // Validate: only one field can be updated at a time
    if (
      (ad_status && typeof is_pause !== "undefined") ||
      (!ad_status && typeof is_pause === "undefined")
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide only one field: either ad_status or is_pause",
      });
    }

    // Prepare update object
    const updateData = {};
    if (ad_status) {
      if (!["Pending", "Accepted", "Rejected"].includes(ad_status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ad_status value",
        });
      }
      updateData.ad_status = ad_status;
    }
    if (typeof is_pause !== "undefined") {
      updateData.is_pause = is_pause;
    }

    const updatedAd = await MapAd.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    if (!updatedAd) {
      return res.status(404).json({
        success: false,
        message: "Map Ad not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Map Ad updated successfully",
      data: updatedAd,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// GET - All Map Ads
router.get("/map-ads", auth, async (req, res) => {
  try {
    const mapAds = await MapAd.find();

    // Get saved map ads by user
    const savedMapIds = (
      await savedMapAd.find({ user: req.user._id }).distinct("mapAd")
    ).map((id) => id.toString());

    const fullUrl = req.protocol + "://" + req.get("host");

    const adsWithFullImages = mapAds.map((ad) => {
      return {
        ...ad.toObject(),
        images: ad.images.map((img) => `${fullUrl}/${img}`),
        is_saved: savedMapIds.includes(ad._id.toString()),
        adType: "map",
      };
    });

    res.status(200).json({
      success: true,
      total: adsWithFullImages.length,
      data: adsWithFullImages,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET - Single Map Ad by ID
router.get("/map-ad/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Find map ad by ID
    const mapAd = await MapAd.findById(id);
    if (!mapAd) {
      return res
        .status(404)
        .json({ success: false, message: "No map ad found" });
    }

    // Get saved map ads by user
    const savedMapIds = (
      await savedMapAd.find({ user: req.user._id }).distinct("mapAd")
    ).map((id) => id.toString());

    const fullUrl = req.protocol + "://" + req.get("host");

    // Build response with full image URLs + saved flag
    const adWithFullImages = {
      ...mapAd.toObject(),
      images: mapAd.images.map((img) => `${fullUrl}/${img}`),
      is_saved: savedMapIds.includes(mapAd._id.toString()),
      adType: "map",
    };

    res.status(200).json({
      success: true,
      data: adWithFullImages,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Helper function to calculate distance between two coordinates
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// Helper function for featured/promoted map ads
async function getMapAds(req, res, boostField) {
  try {
    const filters = {
      status: "Published",
      ad_status: "Accepted",
      expiryDate: { $gte: new Date() },
      [boostField]: true,
    };

    const mapAds = await MapAd.find(filters);

    const savedMapIds = (
      await savedMapAd.find({ user: req.user._id }).distinct("mapAd")
    ).map((id) => id.toString());

    const fullUrl = `${req.protocol}://${req.get("host")}`;

    const adsWithFullImages = mapAds.map((ad) => ({
      ...ad.toObject(),
      images: ad.images.map((img) => `${fullUrl}/${img}`),
      is_saved: savedMapIds.includes(ad._id.toString()),
      adType: "map",
    }));

    res.status(200).json({
      success: true,
      total: adsWithFullImages.length,
      data: adsWithFullImages,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

// Routes for promoted/featured map ads
router.get("/promoted-map-ads", auth, (req, res) =>
  getMapAds(req, res, "is_promoted")
);

router.get("/featured-map-ads", auth, (req, res) =>
  getMapAds(req, res, "is_featured")
);

// ========================= END MAP ADS APIS =========================

// GET all AdDuration by type
router.get("/all_adDuration", auth, async (req, res) => {
  try {
    const { type } = req.query;

    // if type is missing → return 400
    if (!type) {
      return res.status(400).json({
        success: false,
        message:
          "Type query parameter is required (Classified, Auction, or Map)",
      });
    }

    // validate enum
    if (!["Classified", "Auction", "Map"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Must be 'Classified', 'Auction', or 'Map'",
      });
    }

    const durations = await adDuration.find({ type });

    return res.status(200).json({
      success: true,
      count: durations.length,
      data: durations,
    });
  } catch (error) {
    console.error("Error fetching durations:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// POST /save-ad/:id
router.post("/save-ad/:id", auth, async (req, res) => {
  try {
    const { id } = req.params; // only ad id from URL
    const { adType, action } = req.body; // other params from body

    if (!id || !adType || !action) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    if (adType === "classified") {
      if (action === "save") {
        const exists = await savedClassifiedAd.findOne({
          user: req.user._id,
          classifiedAd: id,
        });
        if (exists)
          return res.json({ success: true, message: "Already saved" });

        const saved = new savedClassifiedAd({
          user: req.user._id,
          classifiedAd: id,
        });
        await saved.save();
        return res.json({ success: true, message: "Classified ad saved" });
      } else if (action === "unsave") {
        await savedClassifiedAd.findOneAndDelete({
          user: req.user._id,
          classifiedAd: id,
        });
        return res.json({ success: true, message: "Classified ad unsaved" });
      }
    }

    if (adType === "auction") {
      if (action === "save") {
        const exists = await savedAuctionAd.findOne({
          user: req.user._id,
          auctionAd: id,
        });
        if (exists)
          return res.json({ success: true, message: "Already saved" });

        const saved = new savedAuctionAd({ user: req.user._id, auctionAd: id });
        await saved.save();
        return res.json({ success: true, message: "Auction ad saved" });
      } else if (action === "unsave") {
        await savedAuctionAd.findOneAndDelete({
          user: req.user._id,
          auctionAd: id,
        });
        return res.json({ success: true, message: "Auction ad unsaved" });
      }
    }

    if (adType === "map") {
      if (action === "save") {
        const exists = await savedMapAd.findOne({
          user: req.user._id,
          mapAd: id,
        });
        if (exists)
          return res.json({ success: true, message: "Already saved" });

        const saved = new savedMapAd({ user: req.user._id, mapAd: id });
        await saved.save();
        return res.json({ success: true, message: "Map ad saved" });
      } else if (action === "unsave") {
        await savedMapAd.findOneAndDelete({
          user: req.user._id,
          mapAd: id,
        });
        return res.json({ success: true, message: "Map ad unsaved" });
      }
    }

    return res.status(400).json({ success: false, message: "Invalid adType" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /report/:type/:id
router.post("/report/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, type } = req.body;

    if (!reason) {
      return res
        .status(400)
        .json({ success: false, message: "Reason is required" });
    }

    let adExists = null;

    if (type === "classified") {
      adExists = await ClassifiedAd.findById(id);
      if (!adExists) {
        return res
          .status(404)
          .json({ success: false, message: "Classified Ad not found" });
      }
    } else if (type === "auction") {
      adExists = await AuctionAd.findById(id);
      if (!adExists) {
        return res
          .status(404)
          .json({ success: false, message: "Auction Ad not found" });
      }
    } else if (type === "map") {
      adExists = await MapAd.findById(id);
      if (!adExists) {
        return res
          .status(404)
          .json({ success: false, message: "Map Ad not found" });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid ad type. Use 'classified', 'auction', or 'map'.",
      });
    }

    // Create report
    const report = await AdReport.create({
      user: req.user._id,
      adType:
        type === "classified"
          ? "Classified"
          : type === "auction"
          ? "Auction"
          : "Map",
      classifiedAd: type === "classified" ? id : undefined,
      auctionAd: type === "auction" ? id : undefined,
      mapAd: type === "map" ? id : undefined,
      reason,
    });

    return res.status(201).json({ success: true, report });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// send-message
router.post("/send-message/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // You can later fetch the ad + user if needed, for now just return text
    res.status(200).json({
      success: true,
      message: "Message sent successfully on ad's user phone number",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// GET: filter bids by logged-in user and offer_status
router.get("/my-bids/", auth, async (req, res) => {
  try {
    const { offer_status } = req.query;
    const userId = req.user.id;

    // Build filter object
    let filter = { user: userId };
    if (offer_status) {
      filter.offer_status = offer_status;
    }

    const bids = await BidHistory.find(filter)
      .populate("auctionAd", "title startingPrice endDate")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: bids.length,
      data: bids,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update top pending bid to "Offered"
router.post("/auction-ad/:id/update-offer", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // find top pending bid
    const topBid = await BidHistory.findOne({
      auctionAd: id,
      offer_status: "Pending",
    })
      .sort({ currentPlacedAmount: -1 })
      .populate("user", "name email")
      .exec();

    if (!topBid) {
      return res.status(404).json({ message: "No pending bids found" });
    }

    // fetch auction details to get the title
    const auction = await AuctionAd.findById(id).select("title");

    // update status
    topBid.offer_status = "Offered";
    await topBid.save();

    // ✅ Create notification for this user
    await Notification.create({
      title: "You have received an offer",
      text: `Your bid on auction "${
        auction?.title || "Untitled"
      }" has been marked as an offer. Please accept or reject the auction bid you have won.`,
      userId: topBid.user._id,
      user: topBid.user._id,
      auctionId: id,
      description: `Your bid on auction "${
        auction?.title || "Untitled"
      }" has been marked as an offer. Please accept or reject the auction bid you have won.`,
      is_read: false,
    });

    res.status(200).json({
      message: "Top bid updated to Offered and notification created",
      bid: topBid,
    });
  } catch (error) {
    console.error("Error updating top bid:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/// Update top bid offer_status (Accepted / Rejected)
router.post("/auction-ad/:id/buy-update-offer", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { offer_status } = req.body;

    if (!["Accepted", "Rejected"].includes(offer_status)) {
      return res.status(400).json({ message: "Invalid offer_status value" });
    }

    const topBid = await BidHistory.findOne({
      auctionAd: id,
      offer_status: "Offered",
    })
      .sort({ currentPlacedAmount: -1 })
      .populate("user", "name email")
      .exec();

    if (!topBid) {
      return res.status(404).json({ message: "No offered bid found" });
    }

    topBid.offer_status = offer_status;
    await topBid.save();

    const auction = await AuctionAd.findById(id).populate("user", "name email");

    if (auction && auction.user) {
      await Notification.create({
        title: `Your offer was ${offer_status}`,
        text: `The user "${
          topBid.user?.name
        }" has ${offer_status.toLowerCase()} your offer on auction "${
          auction.title
        }".`,
        userId: auction.user._id,
        auctionId: id,
      });
    }

    // ✅ If Accepted, notify all other bidders
    if (offer_status === "Accepted") {
      await notifyOtherBidders(
        id,
        "Auction offer accepted",
        `The auction "${auction?.title}" has been accepted. Better luck next time!`,
        req.user._id // logged-in user
      );
    }

    res.status(200).json({
      message: `Top bid updated to ${offer_status} and notifications sent`,
      bid: topBid,
    });
  } catch (error) {
    console.error("Error updating bid offer_status:", error);
    res.status(500).json({ message: error.message });
  }
});

// GET notifications for logged-in user
router.get("/notifications", auth, async (req, res) => {
  try {
    // Support notifications stored with either `userId` or `user` (ObjectId or string)
    const uid = req.user._id;
    const uidStr = uid.toString();

    const notifications = await Notification.find({
      $or: [
        { userId: uid },
        { userId: uidStr },
        { user: uid },
        { user: uidStr },
      ],
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/read
router.patch("/notifications/read", auth, async (req, res) => {
  try {
    const { id, all_read } = req.body;

    if (!id && !all_read) {
      return res.status(400).json({
        success: false,
        message: "Provide either notification id or all_read=true",
      });
    }
    console.log(req.user._id, id);

    let result;
    if (all_read === true) {
      // Mark all unread notifications for this user as read
      const uid = req.user._id;
      const uidStr = uid.toString();
      result = await Notification.updateMany(
        {
          is_read: false,
          $or: [
            { userId: uid },
            { userId: uidStr },
            { user: uid },
            { user: uidStr },
          ],
        },
        { $set: { is_read: true } }
      );
    } else if (id) {
      // Mark a single notification as read
      const notifId = mongoose.Types.ObjectId.isValid(id)
        ? new mongoose.Types.ObjectId(id)
        : id;
      const uid = req.user._id;
      const uidStr = uid.toString();
      result = await Notification.findOneAndUpdate(
        {
          _id: notifId,
          $or: [
            { userId: uid },
            { userId: uidStr },
            { user: uid },
            { user: uidStr },
          ],
        },
        { $set: { is_read: true } },
        { new: true }
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }
    }

    return res.json({
      success: true,
      message: all_read
        ? "All notifications marked as read"
        : "Notification marked as read",
      data: result,
    });
  } catch (error) {
    console.error("Error updating notifications:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /send-email
// Body: { email: string, message: string }
router.post("/send-email", auth, async (req, res) => {
  try {
    const { email, message } = req.body;
    if (!email || !message) {
      return res.status(400).json({
        success: false,
        message: "Both 'email' and 'message' are required",
      });
    }

    await sendEmail(email, "Message from Esycles", message);

    return res
      .status(200)
      .json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    console.error("Send email error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
