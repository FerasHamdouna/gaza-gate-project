# Gaza Gate

The backend for **Gaza Gate**, a local marketplace where many sellers list products and customers order from several sellers in one checkout.

**Case study:** [ferashamdouna.vercel.app/en/work/gazagate](https://ferashamdouna.vercel.app/en/work/gazagate)

## What it does

- **Multi-seller orders:** one cart and checkout, split into per-seller orders with their own status flow and totals.
- **Real-time chat:** buyer and seller conversations over Socket.io, plus live notifications.
- **Trust score:** reviews in both directions (customers rate sellers, sellers rate buyers) feed trusted seller and trusted buyer signals.
- **Three roles:** customer, seller and admin, each with its own routes and permissions.
- **Seller dashboard:** sales overview, products, orders and replies to reviews.
- **AI features:** chatbots for customers and sellers, and AI-generated branded product images from a seller's photo and logo.
- **Auth:** email and password with verification and password reset, Google sign-in, JWT access tokens with refresh-token rotation.
- **Media:** product images uploaded to Cloudinary.

## Stack

Node.js · Express · MySQL · Sequelize · Socket.io · JWT · Cloudinary · Resend (email) · Jest + Supertest

## Project structure

```
routes/       admin, customer, seller and shared route groups (mounted under /api)
controllers/  request handlers
services/     business logic: orders, catalog, reviews, identity, AI, notifications
models/       Sequelize models and associations
socket/       Socket.io handlers for chat and notifications
middlewares/  auth, role checks, validation, error handling
tests/        unit, integration and API contract tests
```

## Run locally

Requirements: Node.js 18+ and a MySQL database.

```bash
npm install
npm start
```

Create a `.env` file in the project root:

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port |
| `MYSQL_URI` | MySQL connection string |
| `JWT_SECRET_KEY`, `REFRESH_SECRET_KEY`, `PENDING_SECRET_KEY` | Token signing secrets |
| `BCRYPT_SALT_ROUNDS`, `DUMMY_HASH` | Password hashing settings |
| `GOOGLE_CLIENT_ID` | Google sign-in |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image uploads |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPPORT_EMAIL` | Transactional email |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_IMAGE_MODEL`, `AI_RATE_LIMIT_MAX_RETRIES` | AI assistant |
| `SITE_IDENTITY_IMAGE_URL` | Logo used in emails |

## Tests

```bash
npm test
```

## Author

Built by **Feras Hamdouna**, Backend Developer. [Portfolio](https://ferashamdouna.vercel.app/en) · [GitHub](https://github.com/FerasHamdouna)
