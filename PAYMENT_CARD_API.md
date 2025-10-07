# Payment Card API with Stripe Integration

## Overview

The payment card API integrates with Stripe for secure card management by directly attaching payment methods to customers. This approach ensures PCI compliance by never handling raw card data on the server.

## Frontend Integration Flow

1. **Use Stripe Elements**: Collect card data securely on the frontend using Stripe Elements
2. **Create Payment Method**: Use Stripe.js to create a payment method with the card data
3. **Attach Payment Method**: Call `/api/payment-cards` with the payment method ID to attach it to the customer

## API Endpoints

### 1. Add Payment Card

**POST** `/api/payment-cards`

**Request Body:**

```json
{
  "payment_method_id": "pm_1234567890abcdef"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Payment card added successfully",
  "data": {
    "_id": "card_id",
    "user": "user_id",
    "stripe_payment_method_id": "pm_xxx",
    "stripe_customer_id": "cus_xxx",
    "card_brand": "visa",
    "card_last4": "4242",
    "card_exp_month": 12,
    "card_exp_year": 2025,
    "is_default": true,
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Get User Payment Cards

**GET** `/api/payment-cards`

**Response:**

```json
{
  "success": true,
  "message": "Payment cards retrieved successfully",
  "data": [
    {
      "_id": "card_id",
      "user": "user_id",
      "stripe_payment_method_id": "pm_xxx",
      "card_brand": "visa",
      "card_last4": "4242",
      "card_exp_month": 12,
      "card_exp_year": 2025,
      "is_default": true
    }
  ]
}
```

### 3. Update Payment Card

**PUT** `/api/payment-cards/:id`

**Request Body:**

```json
{
  "card_holder_name": "Jane Doe",
  "email": "jane@example.com"
}
```

### 4. Delete Payment Card

**DELETE** `/api/payment-cards/:id`

**Response:**

```json
{
  "success": true,
  "message": "Payment card deleted successfully"
}
```

### 5. Set Default Payment Card

**PUT** `/api/payment-cards/:id/set-default`

**Response:**

```json
{
  "success": true,
  "message": "Payment card set as default successfully",
  "data": {
    "_id": "card_id",
    "is_default": true,
    "card_brand": "visa",
    "card_last4": "4242"
  }
}
```

## Frontend Implementation Example

Here's how to implement the frontend using Stripe Elements:

```javascript
// 1. Create Setup Intent
const createSetupIntent = async () => {
  const response = await fetch("/api/payment-cards/setup-intent", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const { data } = await response.json();
  return data.client_secret;
};

// 2. Initialize Stripe Elements
const stripe = Stripe("pk_test_your_publishable_key");
const elements = stripe.elements();

const cardElement = elements.create("card");
cardElement.mount("#card-element");

// 3. Confirm Setup Intent
const confirmSetupIntent = async () => {
  const clientSecret = await createSetupIntent();

  const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
    payment_method: {
      card: cardElement,
      billing_details: {
        name: "John Doe",
        email: "john@example.com",
      },
    },
  });

  if (error) {
    console.error("Error:", error);
  } else {
    // 4. Save payment method
    await savePaymentMethod(setupIntent.payment_method.id);
  }
};

// 5. Save payment method to backend
const savePaymentMethod = async (paymentMethodId) => {
  const response = await fetch("/api/payment-cards", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_method_id: paymentMethodId,
    }),
  });

  const result = await response.json();
  console.log("Payment card saved:", result);
};
```

## Key Changes

### Database Schema Updates

- **User Model**: Added `stripe_customer_id` field
- **PaymentCard Model**: Completely restructured to work with Stripe:
  - `stripe_payment_method_id`: Stripe payment method ID
  - `stripe_customer_id`: Stripe customer ID
  - `card_brand`: Card brand (visa, mastercard, etc.)
  - `card_last4`: Last 4 digits of card
  - `card_exp_month`/`card_exp_year`: Expiration date
  - `is_default`: Whether this is the default payment method

### Security Improvements

- **No raw card data**: Card numbers, CVC, and expiry dates are never sent to your server
- **PCI Compliance**: All sensitive data is handled by Stripe Elements on the frontend
- **Setup Intents**: Secure method for saving payment methods without immediate charges
- **Tokenization**: Card data is tokenized by Stripe before reaching your backend

### New Features

- Automatic Stripe customer creation
- Default payment method management
- Stripe payment method attachment/detachment
- Enhanced error handling

## Frontend Implementation Example

```javascript
// Initialize Stripe
const stripe = Stripe("pk_test_your_publishable_key");
const elements = stripe.elements();

// Create card element
const cardElement = elements.create("card");
cardElement.mount("#card-element");

// Handle form submission
document
  .getElementById("payment-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const { error, paymentMethod } = await stripe.createPaymentMethod({
      type: "card",
      card: cardElement,
    });

    if (error) {
      console.error("Error:", error);
    } else {
      // Send payment method ID to your backend
      const response = await fetch("/api/payment-cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + userToken,
        },
        body: JSON.stringify({
          payment_method_id: paymentMethod.id,
        }),
      });

      const result = await response.json();
      console.log("Payment card added:", result);
    }
  });
```

## Environment Variables Required

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx  # For frontend
```

## Testing

Use Stripe test card numbers with Stripe Elements:

- **Visa**: 4242424242424242
- **Mastercard**: 5555555555554444
- **American Express**: 378282246310005
- **Declined Card**: 4000000000000002
- **CVC**: Any 3-4 digit number
- **Expiry**: Any future date

## Important Notes

1. **Never send raw card data** to your backend - always use Stripe Elements
2. **Use Setup Intents** for saving payment methods without charging
3. **Handle errors gracefully** - Stripe Elements will validate card data
4. **Test thoroughly** with Stripe's test card numbers
5. **Keep your secret keys secure** - never expose them in frontend code
