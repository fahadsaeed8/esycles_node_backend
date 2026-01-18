const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const { query, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const upload = require("../middleware/upload");
const { uploadMultipleProductImages } = require("../middleware/multerConfig");
const uploadMultipleReturnOrderImages = require("../middleware/returnOrderUpload");

const {
  Product,
  Cart,
  Order,
  ShippingMethod,
  Color,
  Brand,
  Model,
  Review,
  ReturnOrder,
} = require("../models/Products");
const fs = require("fs");
const UtilModel = require("../models/Utils");
const Notification = UtilModel.Notification;
// Import Product model
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const multer = require("multer");
const csv = require("csv-parser");
const { Readable } = require("stream");
const OpenAI = require("openai");
const PaymentCard = require("../models/PaymentCard");
const stripeService = require("../services/stripeService");

const uploadCSV = multer({ storage: multer.memoryStorage() });

require("dotenv").config();

// @route   GET /api/products
// @desc    Get all products
// @access  Public
router.get(
  "/landing_products",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Limit must be a positive integer"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // ✅ Sort by createdAt (latest first)
      let products = await Product.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Convert image paths to absolute URLs
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      products = products.map((product) => {
        const prod = product.toObject();
        prod.images = prod.images.map((img) => {
          const imagePath = img.startsWith("/") ? img : `/${img}`;
          return `${baseUrl}${imagePath}`;
        });
        return prod;
      });

      const total = await Product.countDocuments();

      res.json({
        success: true,
        total,
        page,
        limit,
        data: products,
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server Error");
    }
  }
);

// ✅ All Products API
router.get(
  "/all_products",
  [
    query("type")
      .notEmpty()
      .withMessage("Type is required")
      .isIn([
        "BICYCLES",
        "EBIKES",
        "ESCOOTERS",
        "EXERCISE BICYCLES",
        "ESKATEBOARDS",
        "HOVERBOARDS",
      ])
      .withMessage("Invalid product type"),
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Limit must be a positive integer"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        type,
        model,
        brand,
        color,
        rating,
        min_price,
        max_price,
        stock,
        country,
      } = req.query;

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // ✅ Build product filters
      let filters = { type };

      if (model) filters.model = model;
      if (brand) filters.brand = brand;
      if (color) filters.color = color;
      if (rating) filters.rating = { $gte: Number(rating) };
      if (min_price || max_price) {
        filters.price = {};
        if (min_price) filters.price.$gte = Number(min_price);
        if (max_price) filters.price.$lte = Number(max_price);
      }
      if (stock) {
        if (stock.toLowerCase() === "yes") {
          filters.stock = { $gt: 0 };
        } else if (stock.toLowerCase() === "no") {
          filters.stock = { $lte: 0 };
        }
      }

      // ✅ Vendor Country Filter
      if (country) {
        const vendors = await User.find({
          role: "vendor",
          "address.country": new mongoose.Types.ObjectId(country),
        }).select("_id");

        const vendorIds = vendors.map((v) => v._id);
        filters.seller = { $in: vendorIds };
      }

      // ✅ Fetch products (latest first)
      let products = await Product.find(filters)
        .sort({ createdAt: -1 }) // 👈 LATEST FIRST
        .skip(skip)
        .limit(limit)
        .populate("model brand color seller");

      if (!products.length) {
        return res.status(200).json({
          success: false,
          data: [],
          message: `No products found for type "${type}"`,
        });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;

      // ✅ Map products for response
      products = products.map((product) => {
        const prod = product.toObject();

        // Absolute URLs for images
        prod.images = prod.images.map((img) => {
          const imagePath = img.startsWith("/") ? img : `/${img}`;
          return `${baseUrl}${imagePath}`;
        });

        // Price range & discount
        if (prod.old_price && prod.price) {
          prod.priceRange = `$${prod.old_price} - $${prod.price}`;
          prod.discount = prod.old_price - prod.price;
        } else {
          prod.priceRange = prod.price ? `$${prod.price}` : "$0";
          prod.discount = 0;
        }

        // MOQ
        prod.MOQ = prod.MOQ || 1;

        // Installment
        prod.installment = prod.installmentMonth
          ? `${(prod.price / prod.installmentMonth).toFixed(2)}`
          : null;

        return prod;
      });

      const total = await Product.countDocuments(filters);

      res.json({
        success: true,
        total,
        page,
        limit,
        data: products,
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server Error");
    }
  }
);

// Single product API
router.get("/product/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { product_quantity, cost } = req.query;
    const userId = req.user?._id; // ✅ logged-in user

    // ✅ Fetch product by ID and populate seller object
    const product = await Product.findById(id)
      .populate({
        path: "seller",
        select: "-password -is_active -is_staff -created_at -updated_at",
        populate: [
          { path: "address.city" },
          { path: "address.state" },
          { path: "address.country" },
          { path: "language" },
        ],
      })
      .populate("shipping");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product not found`,
      });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const prod = product.toObject();

    // ✅ FIXED: Convert images to absolute URLs with proper slash handling
    prod.images = prod.images.map((img) => {
      const imagePath = img.startsWith("/") ? img : `/${img}`;
      return `${baseUrl}${imagePath}`;
    });

    // Price range = old_price - price
    if (prod.old_price && prod.price) {
      prod.priceRange = `$${prod.old_price} - $${prod.price}`;
      prod.discount = prod.old_price - prod.price;
    } else {
      prod.priceRange = prod.price ? `$${prod.price}` : "$0";
      prod.discount = 0;
    }

    // MOQ
    prod.MOQ = prod.MOQ || 1;

    // Installment
    prod.installment = prod.installmentMonth
      ? `${(prod.price / prod.installmentMonth).toFixed(2)}`
      : null;

    // ✅ Calculate total_price if product_quantity exists
    if (product_quantity) {
      let total_price = prod.price * Number(product_quantity);

      // If cost param exists, add it
      if (cost) {
        total_price += Number(cost);
      }

      prod.total_price = total_price;
    }

    // ✅ Fetch seller's shipping methods
    let shippingMethods = [];
    if (product.seller && product.seller._id) {
      shippingMethods = await ShippingMethod.find({ user: product.seller._id });
    }

    // ✅ Check if user has already reviewed this product
    let isReview = false;
    if (userId) {
      const existingReview = await Review.findOne({
        product: id,
        user: userId,
      });
      if (existingReview) {
        isReview = true;
      }
    }

    res.json({
      success: true,
      data: {
        ...prod,
        shipping_methods: shippingMethods,
        is_review: isReview, // ✅ new flag
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

/// Add to Cart API (using authenticated user)
router.post("/cart/add", auth, async (req, res) => {
  try {
    // Get user ID from the authenticated request
    const userId = req.user._id; // Assuming your auth middleware adds user to req
    const { productId, quantity } = req.body;

    // Validate input (no need to check userId now)
    if (!productId || !quantity) {
      return res
        .status(400)
        .json({ message: "Missing required fields: productId and quantity" });
    }

    // Get product to check price and stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check stock availability
    if (product.stock < quantity) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    // Find existing cart or create new one
    let cart = await Cart.findOne({ user: userId, status: "active" });

    if (!cart) {
      cart = new Cart({
        user: userId,
        items: [],
        total_price: 0,
        status: "active",
      });
    }

    // Check if product already exists in cart
    const existingItemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId
    );

    // Apply discount if available
    let finalPrice = product.price;
    if (
      product.discount_price_tiers &&
      product.discount_price_tiers.length > 0
    ) {
      // Calculate total quantity (existing + new)
      const totalQuantity =
        existingItemIndex >= 0
          ? cart.items[existingItemIndex].quantity + quantity
          : quantity;

      // Find the best discount tier
      const discountTier = product.discount_price_tiers.find(
        (tier) =>
          totalQuantity >= tier.min_qty &&
          (tier.max_qty ? totalQuantity <= tier.max_qty : true)
      );
      if (discountTier) {
        finalPrice = discountTier.price;
      }
    }

    if (existingItemIndex >= 0) {
      // Update existing item
      cart.items[existingItemIndex].quantity += quantity;
      cart.items[existingItemIndex].price = finalPrice;
    } else {
      // Add new item
      cart.items.push({
        product: productId,
        quantity,
        price: finalPrice,
      });
    }

    // Recalculate total price
    cart.total_price = cart.items.reduce((total, item) => {
      return total + item.price * item.quantity;
    }, 0);

    await cart.save();

    res.status(200).json({
      message: "Product added to cart successfully",
      cart,
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Remove Item from Cart API
router.post("/cart/remove-item", auth, async (req, res) => {
  try {
    const userId = req.user._id; // from auth middleware
    const { itemId } = req.body;

    if (!itemId) {
      return res
        .status(400)
        .json({ message: "Missing required field: itemId" });
    }

    // Find active cart
    const cart = await Cart.findOne({ user: userId, status: "active" });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Find the item by its _id
    const itemIndex = cart.items.findIndex(
      (item) => item._id.toString() === itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    // Remove the item
    cart.items.splice(itemIndex, 1);

    // Recalculate total price
    cart.total_price = cart.items.reduce((total, item) => {
      return total + item.price * item.quantity;
    }, 0);

    await cart.save();

    res.status(200).json({
      message: "Item removed from cart successfully",
      cart,
    });
  } catch (error) {
    console.error("Error removing item from cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/cart/my-cart", auth, async (req, res) => {
  try {
    const userId = req.user._id;

    let cart = await Cart.findOne({ user: userId, status: "active" }).populate({
      path: "items.product",
      select: "title price images brand model color",
      populate: [
        { path: "brand", select: "name" },
        { path: "model", select: "name" },
        { path: "color", select: "name hex" },
      ],
    });

    if (!cart) {
      return res.status(200).json({
        message: "No active cart found",
        cart: { items: [], total_price: 0 },
      });
    }

    // Construct base URL
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Convert to plain JS object so we can modify
    cart = cart.toObject();

    // Add `id` field to each item
    cart.items = cart.items.map((item) => {
      const newItem = {
        _id: item._id, // include item id
        ...item,
      };

      if (item.product && item.product.images) {
        newItem.product.images = item.product.images.map((img) => {
          // If image already has http(s) protocol, return as is
          if (img.startsWith("http")) {
            return img;
          }

          // Replace backslashes with forward slashes and ensure proper path
          const normalizedPath = img.replace(/\\/g, "/");

          // Remove any leading slash to avoid double slashes
          const cleanPath = normalizedPath.startsWith("/")
            ? normalizedPath.substring(1)
            : normalizedPath;

          return `${baseUrl}/${cleanPath}`;
        });
      }

      return newItem;
    });

    res.status(200).json({
      message: "Cart retrieved successfully",
      cart,
    });
  } catch (error) {
    console.error("Error getting cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /cart/filter_cart
router.post("/cart/filter_cart", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { itemIds } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: "itemIds array is required" });
    }

    // Find the active cart and populate product details
    const cart = await Cart.findOne({
      user: userId,
      status: "active",
    }).populate({
      path: "items.product",
      populate: {
        path: "seller",
        select: "-password -is_active -is_staff -created_at -updated_at",
        populate: [
          { path: "address.city" },
          { path: "address.state" },
          { path: "address.country" },
          { path: "language" },
        ],
      },
    });

    if (!cart) {
      return res.status(404).json({ message: "No active cart found" });
    }

    // Convert to plain object
    const cartObj = cart.toObject();

    // Filter items that match provided IDs
    const filteredItems = cartObj.items.filter((item) =>
      itemIds.includes(item._id.toString())
    );

    if (filteredItems.length === 0) {
      return res
        .status(404)
        .json({ message: "No matching items found in cart" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Calculate total_price and total_old_price
    let total_price = 0;
    let total_old_price = 0;

    // Process items and fetch shipping methods for each product
    const items = await Promise.all(
      filteredItems.map(async (i) => {
        const prod = i.product;

        if (prod && prod.images) {
          prod.images = prod.images.map((img) => {
            // If image already has http(s) protocol, return as is
            if (img.startsWith("http")) {
              return img;
            }

            // Replace backslashes with forward slashes and ensure proper path
            const normalizedPath = img.replace(/\\/g, "/");

            // Remove any leading slash to avoid double slashes
            const cleanPath = normalizedPath.startsWith("/")
              ? normalizedPath.substring(1)
              : normalizedPath;

            return `${baseUrl}/${cleanPath}`;
          });
        }

        // ✅ Fetch seller's shipping methods
        let shippingMethods = [];
        if (prod.seller && prod.seller._id) {
          shippingMethods = await ShippingMethod.find({
            user: prod.seller._id,
          }).select("-user -createdAt -updatedAt -__v");
        }

        // Calculate prices
        const itemTotalPrice = i.price * i.quantity;
        const itemTotalOldPrice = (prod.old_price || i.price) * i.quantity;

        total_price += itemTotalPrice;
        total_old_price += itemTotalOldPrice;

        return {
          id: i._id,
          product: {
            ...prod,
            shipping_methods: shippingMethods,
          },
          quantity: i.quantity,
          price: i.price,
          item_total_price: itemTotalPrice,
          item_total_old_price: itemTotalOldPrice,
        };
      })
    );

    const discount = total_old_price - total_price;

    res.status(200).json({
      message: "Filtered cart calculated successfully",
      total_price,
      total_old_price,
      discount,
      items,
      item_count: items.length,
    });
  } catch (error) {
    console.error("Error in filter_cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/// Create order from selected cart items or direct product purchase
router.post("/orders/create", auth, async (req, res) => {
  try {
    const {
      selectedCartItemIds,
      productId,
      quantity,
      paymentMethod,
      shippingAddress,
      shipping_method,
      order_source,
    } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!shippingAddress) {
      return res
        .status(400)
        .json({ message: "Missing required field: shippingAddress" });
    }

    if (!shipping_method) {
      return res
        .status(400)
        .json({ message: "Missing required field: shipping_method" });
    }

    // Validate shipping_method is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(shipping_method)) {
      return res.status(400).json({
        message: "Invalid shipping_method: must be a valid ObjectId",
      });
    }

    // Determine order source and validate accordingly
    const isShopNow = order_source === "shop_now" || productId;
    const isCartSelection =
      order_source === "cart_selection" || selectedCartItemIds;

    if (!isShopNow && !isCartSelection) {
      return res.status(400).json({
        message:
          "Missing order information: Provide either productId (for direct purchase) or selectedCartItemIds (for cart selection)",
      });
    }

    let selectedItems = [];
    let totalPrice = 0;
    let cart; // Declare cart variable for cart selection flow

    if (isShopNow) {
      // Handle direct purchase (shop now) flow
      if (!productId) {
        return res
          .status(400)
          .json({ message: "Missing required field: productId" });
      }

      if (!quantity || quantity < 1) {
        return res
          .status(400)
          .json({ message: "Missing or invalid field: quantity" });
      }

      // Get product details
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check stock
      if (product.stock < quantity) {
        return res.status(400).json({
          message: `Insufficient stock for product: ${product.title}`,
          productId: product._id,
        });
      }

      // Prepare order item
      selectedItems = [
        {
          product: product,
          quantity: quantity,
          price: product.price,
        },
      ];

      totalPrice = product.price * quantity;
    } else {
      // Handle cart selection flow
      if (
        !selectedCartItemIds ||
        !Array.isArray(selectedCartItemIds) ||
        selectedCartItemIds.length === 0
      ) {
        return res.status(400).json({
          message:
            "Missing or invalid field: selectedCartItemIds (must be a non-empty array)",
        });
      }

      // Find user's active cart
      cart = await Cart.findOne({
        user: userId,
        status: "active",
      }).populate("items.product");

      if (!cart) {
        return res.status(404).json({
          message: "No active cart found",
        });
      }

      // Filter cart items to only include selected items
      selectedItems = cart.items.filter((item) =>
        selectedCartItemIds.includes(item._id.toString())
      );

      if (selectedItems.length === 0) {
        return res.status(404).json({
          message: "No matching items found in your cart",
        });
      }

      // Check if all selected items were found
      if (selectedItems.length !== selectedCartItemIds.length) {
        const foundIds = selectedItems.map((item) => item._id.toString());
        const missingIds = selectedCartItemIds.filter(
          (id) => !foundIds.includes(id)
        );

        return res.status(404).json({
          message: "Some selected items were not found in your cart",
          missingItemIds: missingIds,
        });
      }

      // Check stock for all selected items
      for (const item of selectedItems) {
        if (item.product.stock < item.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for product: ${item.product.title}`,
            productId: item.product._id,
          });
        }
      }

      // Calculate total price for cart items
      totalPrice = selectedItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0
      );
    }

    // Prepare order items
    const orderItems = selectedItems.map((item) => ({
      product: item.product._id,
      quantity: item.quantity,
      price: item.price,
    }));

    // Create order - use valid enum values for order_source
    const order = new Order({
      user: userId,
      items: orderItems,
      products: orderItems.map((i) => i.product),
      order_source: isShopNow ? "shop_now" : "cart",
      total_price: totalPrice,
      payment_method: paymentMethod || "cod",
      shipping_address: shippingAddress,
      shipping_method: shipping_method, // This should now be a valid ObjectId
      note: req.body.note || null,
    });

    // Save order and update stock
    const operations = [order.save()];

    // Update product stock
    orderItems.forEach((item) => {
      operations.push(
        Product.updateOne(
          { _id: item.product },
          { $inc: { stock: -item.quantity } }
        )
      );
    });

    // For cart selection, remove selected items from cart
    if (isCartSelection) {
      operations.push(
        Cart.updateOne(
          { _id: cart._id },
          {
            $pull: { items: { _id: { $in: selectedCartItemIds } } },
            $set: { total_price: cart.total_price - totalPrice },
          }
        )
      );
    }

    await Promise.all(operations);

    // Create notifications
    await Notification.create({
      user: userId,
      title: "Order Submitted",
      description: `Your order #${order._id} has been placed successfully.`,
    });

    const vendorIds = [
      ...new Set(selectedItems.map((i) => i.product.seller.toString())),
    ];
    for (const vendorId of vendorIds) {
      await Notification.create({
        user: vendorId,
        title: "New Order Received",
        description: `You have received a new order #${order._id}.`,
      });
    }

    // If cart selection and cart is empty after removal, mark it as inactive or delete it if needed
    if (isCartSelection) {
      const updatedCart = await Cart.findById(cart._id);
      if (updatedCart.items.length === 0) {
        await Cart.deleteOne({ _id: cart._id });
      }
    }

    // Populate for response
    const populatedOrder = await Order.findById(order._id)
      .populate("items.product", "title price images")
      .populate("user", "name email")
      .populate("shipping_method", "name price"); // Populate shipping method if needed

    res.status(201).json({
      message: "Order created successfully",
      order: populatedOrder,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
// My order api
router.get("/orders/my-orders", auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const orders = await Order.find({ user: userId })
      .populate({
        path: "items.product",
        select: "title price images brand model color",
        populate: [
          { path: "brand", select: "name" },
          { path: "model", select: "name" },
          { path: "color", select: "name hex" },
        ],
      })
      .populate("shipping_address") // Populate shipping address
      .populate("shipping_method") // Populate shipping method
      .sort({ createdAt: -1 }); // Newest orders first

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        message: "No orders found",
        orders: [],
      });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const processedOrders = orders.map((order) => {
      const orderObj = order.toObject();

      // Add id field and preserve invoice_number
      orderObj.id = orderObj._id;
      delete orderObj._id;

      // Keep the auto-generated invoice_number as is
      // It will already be present in orderObj.invoice_number

      if (orderObj.shipping_address && orderObj.shipping_address._id) {
        orderObj.shipping_address.id = orderObj.shipping_address._id;
        delete orderObj.shipping_address._id;
      }

      if (orderObj.shipping_method && orderObj.shipping_method._id) {
        orderObj.shipping_method.id = orderObj.shipping_method._id;
        delete orderObj.shipping_method._id;
      }

      if (orderObj.items && orderObj.items.length > 0) {
        orderObj.items = orderObj.items.map((item, index) => {
          item.id = `${orderObj.id}-item-${index}`;

          if (item.product && item.product.images) {
            item.product.images = item.product.images.map((img) => {
              if (img.startsWith("http")) {
                return img;
              }

              const normalizedPath = img.replace(/\\/g, "/");

              const cleanPath = normalizedPath.startsWith("/")
                ? normalizedPath.substring(1)
                : normalizedPath;

              return `${baseUrl}/${cleanPath}`;
            });
          }

          if (item.product && item.product._id) {
            item.product.id = item.product._id;
            delete item.product._id;
          }

          return item;
        });
      }

      return orderObj;
    });

    res.status(200).json({
      message: "Orders retrieved successfully",
      count: processedOrders.length,
      orders: processedOrders,
    });
  } catch (error) {
    console.error("Error getting orders:", error);
    res.status(500).json({
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

router.post("/create-payment-intent", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, currency } = req.body;

    // Get or create Stripe customer for the user
    const stripeCustomerId = await stripeService.getOrCreateCustomer(userId);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // amount in cents
      currency: currency || "usd",
      customer: stripeCustomerId,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/check-intent", auth, async (req, res) => {
  try {
    const { clientSecret, payment_method } = req.body;
    if (!payment_method) {
      return res.status(400).json({ error: "Payment method is required" });
    }

    const intentId = clientSecret.split("_secret")[0];

    const intent = await stripe.paymentIntents.confirm(intentId, {
      payment_method: payment_method,
      return_url: "https://esycles.vercel.app/",
    });

    if (intent.status === "succeeded") {
      return res.json({ status: "accepted" });
    } else {
      return res.json({ status: intent.status });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ POST or Update Review (with images)
router.post(
  "/reviews/:productId",
  auth,
  upload.array("images", 5),
  async (req, res) => {
    try {
      const { rating, review, title } = req.body; // ✅ added title
      const { productId } = req.params;
      const userId = req.user._id;

      const imagePaths = req.files
        ? req.files.map((file) => `/uploads/reviews/${file.filename}`)
        : [];

      // ✅ Create or update review
      const newReview = await Review.findOneAndUpdate(
        { product: productId, user: userId },
        { rating, review, title, images: imagePaths }, // ✅ include title
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      const stats = await Review.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(productId) } },
        {
          $group: {
            _id: "$product",
            avgRating: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]);

      if (stats.length > 0) {
        await Product.findByIdAndUpdate(productId, {
          rating: stats[0].avgRating,
          reviews_count: stats[0].count,
        });
      }

      res.status(201).json({ success: true, review: newReview });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

// ✅ GET Reviews
router.get("/reviews/:productId", auth, async (req, res) => {
  try {
    const { productId } = req.params;
    const BASE_URL = `${req.protocol}://${req.get("host")}`;

    let reviews = await Review.find({ product: productId })
      .populate("user", "name email")
      .populate({
        path: "product",
        select:
          "title description price images product_size rating reviews_count",
        populate: [
          { path: "model" },
          { path: "brand" },
          { path: "seller", select: "name email" },
          { path: "color" },
          { path: "shipping" },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    for (let review of reviews) {
      // ✅ Check if user bought the product
      const orderExists = await Order.exists({
        user: review.user._id,
        products: new mongoose.Types.ObjectId(productId),
      });
      review.is_buy = !!orderExists;

      // ✅ Attach full URL to images
      if (review.images?.length > 0) {
        review.images = review.images.map((img) => {
          const imagePath = img.startsWith("/") ? img : `/${img}`;
          return `${BASE_URL}${imagePath}`;
        });
      }
      if (review.product?.images?.length > 0) {
        review.product.images = review.product.images.map((img) => {
          const imagePath = img.startsWith("/") ? img : `/${img}`;
          return `${BASE_URL}${imagePath}`;
        });
      }

      // ✅ Likes/dislikes/reports counts
      review.likes_count = review.likes?.length || 0;
      review.dislikes_count = review.dislikes?.length || 0;
      review.reports_count = review.reports?.length || 0;

      // ✅ Remove raw arrays
      delete review.likes;
      delete review.dislikes;
      delete review.reports;

      // ✅ Ensure title is returned (in case lean removes defaults)
      review.title = review.title || "";
    }

    // ✅ Calculate average rating
    let avgRating = 0;
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
      avgRating = sum / reviews.length;
    }

    res.status(200).json({
      success: true,
      average_rating: avgRating.toFixed(1),
      total_reviews: reviews.length,
      reviews,
    });
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get(
  "/reviews/:productId/ratings-distribution",
  auth,
  async (req, res) => {
    try {
      const { productId } = req.params;

      // Group by rating and count occurrences
      const stats = await Review.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(productId) } },
        {
          $group: {
            _id: "$rating", // group by rating (1–5)
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } }, // sort by rating desc (5 → 1)
      ]);

      // ✅ Total number of reviews
      const totalReviews = stats.reduce((acc, r) => acc + r.count, 0);

      // ✅ Calculate weighted sum of ratings
      const totalRatingSum = stats.reduce((acc, r) => acc + r._id * r.count, 0);

      // ✅ Calculate average rating
      const averageRating =
        totalReviews > 0 ? (totalRatingSum / totalReviews).toFixed(1) : 0;

      // ✅ Initialize default structure (so missing ratings get 0%)
      const distribution = {
        5: { count: 0, percentage: 0 },
        4: { count: 0, percentage: 0 },
        3: { count: 0, percentage: 0 },
        2: { count: 0, percentage: 0 },
        1: { count: 0, percentage: 0 },
      };

      // ✅ Fill counts + percentages
      stats.forEach((r) => {
        const percentage =
          totalReviews > 0 ? ((r.count / totalReviews) * 100).toFixed(1) : 0;
        distribution[r._id] = {
          count: r.count,
          percentage: Number(percentage),
        };
      });

      res.status(200).json({
        success: true,
        total_reviews: totalReviews,
        average_rating: Number(averageRating),
        distribution,
      });
    } catch (err) {
      console.error("Error fetching rating distribution:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

// ✅ Like a review
router.post("/reviews/:id/like", auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });

    // Remove from dislikes if exists
    review.dislikes = review.dislikes.filter(
      (u) => u.toString() !== req.user._id.toString()
    );

    // Toggle like
    if (review.likes.includes(req.user._id)) {
      review.likes = review.likes.filter(
        (u) => u.toString() !== req.user._id.toString()
      );
    } else {
      review.likes.push(req.user._id);
    }

    await review.save();
    res.json({
      message: "Like updated",
      likes: review.likes.length,
      dislikes: review.dislikes.length,
    });
  } catch (err) {
    console.error("Error liking review:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Dislike a review
router.post("/reviews/:id/dislike", auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });

    // Remove from likes if exists
    review.likes = review.likes.filter(
      (u) => u.toString() !== req.user._id.toString()
    );

    // Toggle dislike
    if (review.dislikes.includes(req.user._id)) {
      review.dislikes = review.dislikes.filter(
        (u) => u.toString() !== req.user._id.toString()
      );
    } else {
      review.dislikes.push(req.user._id);
    }

    await review.save();
    res.json({
      message: "Dislike updated",
      likes: review.likes.length,
      dislikes: review.dislikes.length,
    });
  } catch (err) {
    console.error("Error disliking review:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Report a review
router.post("/reviews/:id/report", auth, async (req, res) => {
  try {
    const { reason } = req.body; // optional reason
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });

    // Check if user already reported
    const alreadyReported = review.reports.find(
      (r) => r.user.toString() === req.user._id.toString()
    );
    if (alreadyReported) {
      return res
        .status(400)
        .json({ message: "You already reported this review" });
    }

    // Add report
    review.reports.push({ user: req.user._id, reason });
    await review.save();

    res.json({
      message: "Review reported successfully",
      total_reports: review.reports.length,
    });
  } catch (err) {
    console.error("Error reporting review:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

//---------------------------------------- Vendoor API---------------------------------------------------- //

router.post(
  "/products",
  auth,
  uploadMultipleProductImages,
  async (req, res) => {
    try {
      const images = req.files ? req.files.map((file) => file.path) : [];

      const product = new Product({
        ...req.body,
        images,
        seller: req.user._id,
      });

      await product.save();
      res.status(201).json({ success: true, data: product });
    } catch (err) {
      if (req.files) {
        req.files.forEach((file) => {
          // Check if file exists before trying to delete
          fs.access(file.path, fs.constants.F_OK, (accessErr) => {
            if (!accessErr) {
              fs.unlink(file.path, (unlinkErr) => {
                if (unlinkErr) console.error("Error deleting file:", unlinkErr);
              });
            }
          });
        });
      }
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

// ✅ AI validation helper with JSON mode
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function validateRow(row, rowIndex) {
  const prompt = {
    role: "user",
    content: `
You are a CSV product data validator.
Rules:
- Price, Old_Price must be numeric
- Foldable, Return_Policy must be boolean (true/false, yes/no, 1/0)
- Stock, MOQ, InstallmentMonth must be integers
- Images must be comma-separated values
- Discount_Price_Tiers must be JSON or empty
- Required fields: Title, Model, Brand, Price

Row ${rowIndex}: ${JSON.stringify(row)}

Return JSON ONLY if you find an error.
Format:
{
  "row": <rowIndex>,
  "error": { "column": "<colName>", "message": "<error>" }
}

⚠️ If no error → return the string "VALID".
    `,
  };

  try {
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a CSV validator for product uploads. 
          Return "VALID" if the row has no issues.
          Otherwise return a JSON object with structure:
          { "row": <row number>, "error": { "column": "<column name>", "message": "<error message>" } }
          Only return ONE error per row.`,
        },
        prompt,
      ],
      temperature: 0,
    });

    const content = chatResponse.choices[0].message.content.trim();

    if (content === "VALID") {
      return null; // ✅ no error
    }

    // try parsing JSON if AI flagged error
    const parsed = JSON.parse(content);
    return parsed;
  } catch (e) {
    return {
      row: rowIndex,
      error: { column: "system", message: "Invalid JSON from AI" },
    };
  }
}

// ✅ Bulk upload API with validation
router.post(
  "/products/bulk-upload",
  auth,
  uploadCSV.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded" });
      }

      // Step 1: Parse CSV
      const rows = [];
      const stream = Readable.from(req.file.buffer.toString());

      await new Promise((resolve, reject) => {
        stream
          .pipe(csv())
          .on("data", (row) => {
            const normalizedRow = {};
            for (let key in row) {
              normalizedRow[key.toLowerCase().trim()] = row[key];
            }
            rows.push(normalizedRow);
          })
          .on("end", resolve)
          .on("error", reject);
      });

      // // Step 2: Validate rows with OpenAI
      // for (let i = 0; i < rows.length; i++) {
      //   const result = await validateRow(rows[i], i + 1);

      //   if (result) {
      //     return res.status(400).json({
      //       success: false,
      //       message: "Validation failed",
      //       error: result,
      //     });
      //   }
      // }

      // Step 3: Build product docs
      const products = [];
      for (let row of rows) {
        const modelDoc = row.model
          ? await Model.findOne({ name: row.model })
          : null;
        const brandDoc = row.brand
          ? await Brand.findOne({ name: row.brand })
          : null;
        const colorDoc = row.color
          ? await Color.findOne({ name: row.color })
          : null;
        const shippingDoc = row.shipping
          ? await ShippingMethod.findOne({ name: row.shipping })
          : null;

        const normalizeBoolean = (val) => {
          if (!val) return null;
          const str = val.toString().toLowerCase().trim();
          return ["true", "1", "yes", "y"].includes(str);
        };

        const normalizeObject = (val) => {
          if (!val) return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        };

        products.push({
          title: row.title,
          description: row.description || "",
          model: modelDoc ? modelDoc._id : null,
          brand: brandDoc ? brandDoc._id : null,
          seller: req.user._id,
          color: colorDoc ? colorDoc._id : null,
          shipping: shippingDoc ? shippingDoc._id : null,
          price: Number(row.price) || 0,
          old_price: Number(row.old_price) || 0,
          discount_price_tiers: normalizeObject(row.discount_price_tiers),
          stock: parseInt(row.stock) || 0,
          product_size: row.product_size || 26,
          type: row.type || "",
          foldable: normalizeBoolean(row.foldable),
          wattage: row.wattage || null,
          model_code: row.model_code || "",
          sku: row.sku || "",
          sku_code: row.sku_code || "",
          images: row.images ? row.images.split(",").map((i) => i.trim()) : [],
          return_policy: normalizeBoolean(row.return_policy),
          customization_options: row.customization_options
            ? row.customization_options.split(",").map((c) => c.trim())
            : [],
          MOQ: parseInt(row.moq) || 0,
          installmentMonth: parseInt(row.installmentmonth) || null,
        });
      }

      // Step 4: Insert into DB
      await Product.insertMany(products);

      return res.status(201).json({
        success: true,
        count: products.length,
        message: `${products.length} products created successfully`,
      });
    } catch (err) {
      console.error("Bulk upload error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ✅ Update Product (only by product owner)
router.patch("/products/:id", auth, async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, seller: req.user._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res
        .status(404)
        .json({ success: false, error: "Product not found or not authorized" });
    }

    res.json({ success: true, data: product });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ✅ Delete Product (only by product owner)
router.delete("/products/:id", auth, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      seller: req.user._id, // check owner
    });

    if (!product) {
      return res
        .status(404)
        .json({ success: false, error: "Product not found or not authorized" });
    }

    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get("/my-products", auth, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user._id })
      .populate("brand model color")
      .sort({ createdAt: -1 });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const productsWithUrls = products.map((p) => ({
      ...p.toObject(),
      images: p.images ? p.images.map((img) => `${baseUrl}/${img}`) : [],
    }));

    res.json({
      success: true,
      count: productsWithUrls.length,
      data: productsWithUrls,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /vendor/orders
router.get("/vendor/orders", auth, async (req, res) => {
  try {
    const vendorId = req.user._id;
    const host = req.get("host");
    const protocol = req.protocol;

    const orders = await Order.find({ products: { $exists: true, $ne: [] } })
      .populate({
        path: "items.product",
        populate: {
          path: "seller",
          select: "-password -is_active -is_staff -created_at -updated_at",
        },
      })
      .populate("user", "name email")
      .populate("shipping_method")
      .populate("shipping_address")
      .sort({ createdAt: -1 });

    const vendorOrders = orders
      .map((order) => {
        const vendorItems = order.items.filter(
          (item) => item.product?.seller?._id.toString() === vendorId.toString()
        );

        if (vendorItems.length === 0) return null;

        // ✅ Process vendor items (images with full URL)
        const processedItems = vendorItems.map((item) => {
          if (item.product && item.product.images) {
            const productWithFullImages = {
              ...item.product.toObject(),
              images: item.product.images.map((image) => {
                if (
                  image.startsWith("http://") ||
                  image.startsWith("https://")
                ) {
                  return image;
                }
                return `${protocol}://${host}/${image.replace(/^\/+/, "")}`;
              }),
            };
            return {
              ...item.toObject(),
              product: productWithFullImages,
            };
          }
          return item;
        });

        // ✅ Process return_images to include full URLs
        const returnImagesWithFullPath = (order.return_images || []).map(
          (image) => {
            if (image.startsWith("http://") || image.startsWith("https://")) {
              return image;
            }
            return `${protocol}://${host}/${image.replace(/^\/+/, "")}`;
          }
        );

        return {
          _id: order._id,
          user: order.user,
          order_source: order.order_source,
          total_price: processedItems.reduce(
            (sum, i) => sum + i.price * i.quantity,
            0
          ),
          payment_status: order.payment_status,
          payment_method: order.payment_method,
          order_status: order.order_status,
          shipping_method: order.shipping_method,
          shipping_address: order.shipping_address,
          note: order.note,
          createdAt: order.createdAt,
          items: processedItems,

          // ✅ New fields
          return_reason: order.return_reason || null,
          return_images: returnImagesWithFullPath,
        };
      })
      .filter((o) => o !== null);

    res.status(200).json({
      success: true,
      count: vendorOrders.length,
      orders: vendorOrders,
    });
  } catch (error) {
    console.error("Error in vendor orders:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Alternative: Separate endpoints for each collection
router.get("/brands", async (req, res) => {
  try {
    const brands = await Brand.find().sort({ name: 1 });
    res.status(200).json({
      success: true,
      data: brands,
      count: brands.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching brands",
      error: error.message,
    });
  }
});

router.get("/models", async (req, res) => {
  try {
    const models = await Model.find()
      .populate("brand", "name description")
      .sort({ name: 1 });
    res.status(200).json({
      success: true,
      data: models,
      count: models.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching models",
      error: error.message,
    });
  }
});

router.get("/colors", async (req, res) => {
  try {
    const colors = await Color.find().sort({ name: 1 });
    res.status(200).json({
      success: true,
      data: colors,
      count: colors.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching colors",
      error: error.message,
    });
  }
});

router.post("/shipping", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, description, cost, estimated_days } = req.body;

    const existingMethod = await ShippingMethod.findOne({
      user: userId,
      name: name,
    });
    if (existingMethod) {
      return res
        .status(400)
        .json({ message: "Shipping method with this name already exists" });
    }

    const shippingMethod = new ShippingMethod({
      user: userId,
      name,
      description,
      cost,
      estimated_days,
    });

    await shippingMethod.save();

    res.status(201).json({
      message: "Shipping method created successfully",
      shippingMethod,
    });
  } catch (error) {
    // Handle duplicate key error specifically
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Shipping method with this name already exists",
      });
    }

    console.error("Error creating shipping method:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Get All Shipping Methods for User
router.get("/all_shippings", auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const shippingMethods = await ShippingMethod.find({ user: userId }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      message: "Shipping methods retrieved successfully",
      shippingMethods,
    });
  } catch (error) {
    console.error("Error getting shipping methods:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Get Single Shipping Method
router.get("/shipping/:id", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const shippingMethod = await ShippingMethod.findOne({
      _id: id,
      user: userId,
    });
    if (!shippingMethod) {
      return res.status(404).json({ message: "Shipping method not found" });
    }

    res.status(200).json({
      message: "Shipping method retrieved successfully",
      shippingMethod,
    });
  } catch (error) {
    console.error("Error getting shipping method:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Partial Update Shipping Method
router.patch("/shipping/:id", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const updateData = req.body;

    // 🔍 If name is being updated, check uniqueness first
    if (updateData.name) {
      const existingMethod = await ShippingMethod.findOne({
        user: userId,
        name: updateData.name,
        _id: { $ne: id }, // exclude current shipping method
      });

      if (existingMethod) {
        return res
          .status(400)
          .json({ message: "Shipping method with this name already exists" });
      }
    }

    const shippingMethod = await ShippingMethod.findOneAndUpdate(
      { _id: id, user: userId },
      { $set: updateData },
      { new: true }
    );

    if (!shippingMethod) {
      return res.status(404).json({ message: "Shipping method not found" });
    }

    res.status(200).json({
      message: "Shipping method updated successfully",
      shippingMethod,
    });
  } catch (error) {
    console.error("Error updating shipping method:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Delete Shipping Method
router.delete("/shipping/:id", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const shippingMethod = await ShippingMethod.findOneAndDelete({
      _id: id,
      user: userId,
    });
    if (!shippingMethod) {
      return res.status(404).json({ message: "Shipping method not found" });
    }

    res.status(200).json({ message: "Shipping method deleted successfully" });
  } catch (error) {
    console.error("Error deleting shipping method:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Update Order Status (PATCH)
router.patch("/order/:orderId/status", auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { order_status } = req.body;

    // Validate status
    const validStatuses = [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(order_status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    // Find the order and make sure it belongs to the logged-in user
    const order = await Order.findOne({ _id: orderId });
    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found or not authorized" });
    }

    // Update only order_status (PATCH)
    order.order_status = order_status;
    await order.save();

    res.json({
      message: "Order status updated successfully",
      order,
    });
  } catch (error) {
    console.error("Update order error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Return / Cancellation API
router.post(
  "/order/:id/return",
  auth,
  uploadMultipleReturnOrderImages,
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        request_type, // "return" or "cancellation"
        product_id, // which product in the order
        product_name, // optional if product_id populated
        sku,
        reason,
        quantity,
        condition, // "unused", "defective", etc. (only for returns)
        preferred_resolution, // "refund", "replacement", "store_credit"
        additional_notes,
      } = req.body;

      // ✅ Validate order
      const order = await Order.findById(id).populate("user");
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // ✅ Evidence images
      const imagePaths = req.files?.map((file) => file.path) || [];

      // ✅ Generate a unique request_id
      const requestId = `RC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // ✅ Create new Return / Cancellation request
      const returnRequest = new ReturnOrder({
        order: order._id,
        user: req.user._id,
        product: {
          product_id,
          name: product_name,
          sku,
        },
        request_type,
        reason,
        quantity,
        condition: request_type === "return" ? condition : "not_applicable",
        preferred_resolution,
        evidence: imagePaths,
        additional_notes,
        request_id: requestId,
        status: "pending",
      });

      await returnRequest.save();

      // ✅ Update order status
      if (request_type === "return") {
        order.order_status = "return_requested";
      } else if (request_type === "cancellation") {
        order.order_status = "cancellation_requested";
      }
      await order.save();

      res.status(201).json({
        message: `${request_type} request submitted successfully`,
        request: returnRequest,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error", error });
    }
  }
);

router.get("/vendor/return-orders", auth, async (req, res) => {
  try {
    const { status } = req.query;
    const host = req.get("host");
    const protocol = req.protocol;

    if (!status) {
      return res
        .status(400)
        .json({ message: "Status query parameter is required" });
    }

    const vendorId = req.user._id; // logged-in vendor

    // ✅ Get orders that belong to vendor
    const orders = await Order.find({
      products: { $exists: true, $ne: [] },
    }).populate({
      path: "products",
      match: { seller: vendorId },
    });

    const orderIds = orders
      .filter((order) => order.products.length > 0)
      .map((order) => order._id);

    // ✅ Build query
    const query = { status, order: { $in: orderIds } };

    // ✅ Fetch Return/Cancellation requests
    const requests = await ReturnOrder.find(query)
      .populate({
        path: "order",
        populate: { path: "products" },
      })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    // ✅ Format response
    const results = requests.map((reqObj) => {
      const request = reqObj.toObject();

      // ---- Fix product images (inside order) ----
      if (request.order?.products) {
        request.order.products = request.order.products.map((prod) => {
          const p = { ...prod };
          if (p.images && p.images.length > 0) {
            p.images = p.images.map((img) => `${protocol}://${host}/${img}`);
          }
          return p;
        });
      }

      // ---- Fix evidence images ----
      if (request.evidence && request.evidence.length > 0) {
        request.evidence = request.evidence.map(
          (img) => `${protocol}://${host}/${img}`
        );
      }

      return {
        request_id: request.request_id,
        request_type: request.request_type,
        status: request.status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,

        // Buyer info
        buyer: {
          name: request.user?.name,
          email: request.user?.email,
        },

        // Order info
        order: {
          id: request.order?._id,
          order_number: request.order?.order_number,
          products: request.order?.products || [],
        },

        // Product details (requested item)
        product: request.product,

        // Request details
        reason: request.reason,
        quantity: request.quantity,
        condition: request.condition,
        preferred_resolution: request.preferred_resolution,
        additional_notes: request.additional_notes,

        // Seller/Admin fields
        return_shipping: request.return_shipping,
        internal_notes: request.internal_notes,
        resolution_date: request.resolution_date,
        ai_risk_flag: request.ai_risk_flag,

        // Evidence images
        evidence: request.evidence,
      };
    });

    res.status(200).json({
      message: "Return/Cancellation requests fetched successfully",
      count: results.length,
      requests: results,
    });
  } catch (error) {
    console.error("Error fetching return orders:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ Update Return Order Status
router.post("/vendor/return-orders/status", auth, async (req, res) => {
  try {
    const { returnOrderId, status } = req.body;

    // ✅ Validation
    if (!returnOrderId || !status) {
      return res
        .status(400)
        .json({ message: "returnOrderId and status are required" });
    }

    // ✅ Allowed statuses
    const allowedStatuses = ["requested", "approved", "rejected", "completed"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    // ✅ Update return order
    const updatedReturnOrder = await ReturnOrder.findByIdAndUpdate(
      returnOrderId,
      { status },
      { new: true }
    )
      .populate("user", "name email")
      .populate({
        path: "order",
        populate: { path: "products" },
      });

    if (!updatedReturnOrder) {
      return res.status(404).json({ message: "Return order not found" });
    }

    res.status(200).json({
      message: "Return order status updated successfully",
      returnOrder: updatedReturnOrder,
    });
  } catch (error) {
    console.error("❌ Error updating return order status:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;
