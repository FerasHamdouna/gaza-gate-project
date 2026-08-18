require("dotenv").config();
require("../../models/associations.js");

const { Op } = require("sequelize");
const { sequelize, connectDB, closeDB } = require("../../config/db.config.js");
const seedRoles = require("../../startup/seedRoles.js");
const { hashPassword } = require("../../utils/security/password.util.js");
const { issueTokenPair } = require("../../services/identity/issueTokens.service.js");
const USER_ROLES = require("../../constants/user/userRoles.constant.js");
const PRODUCT_STATUS = require("../../constants/product/productStatus.constant.js");
const PRODUCT_STOCK_TYPES = require("../../constants/product/stockType.constant.js");

const Role = require("../../models/role.model.js");
const User = require("../../models/user.model.js");
const Customer = require("../../models/customer.model.js");
const Seller = require("../../models/seller.model.js");
const Admin = require("../../models/admin.model.js");
const Address = require("../../models/address.model.js");
const Category = require("../../models/category.model.js");
const Product = require("../../models/product.model.js");
const ProductImage = require("../../models/productImage.model.js");
const Cart = require("../../models/cart.model.js");
const CartItem = require("../../models/cartItem.model.js");
const Wishlist = require("../../models/wishlist.model.js");
const Order = require("../../models/order.model.js");
const OrderItem = require("../../models/orderItem.model.js");
const Review = require("../../models/review.model.js");
const SellerCustomerReview = require("../../models/sellerCustomerReview.model.js");
const Conversation = require("../../models/conversation.model.js");
const Message = require("../../models/message.model.js");
const RefreshToken = require("../../models/refreshToken.model.js");
const EmailVerification = require("../../models/emailVerification.model.js");
const PasswordResetSession = require("../../models/passwordResetSession.model.js");
const UserAuthProvider = require("../../models/UserAuthProvider.model.js");
const UserNotification = require("../../models/userNotification.model.js");
const Notification = require("../../models/notification.model.js");
const ChatbotRecord = require("../../models/chatbotRecord.model.js");

const QA_PREFIX = "qa_audit_";
const QA_CATEGORY_NAME = "QA Audit Category";

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const mockReq = ({ user, body = {}, params = {}, query = {}, headers = {} }) => ({
  user,
  body,
  params,
  query,
  headers,
  cookies: {},
  file: null,
  files: null,
});

async function ensureConnected(retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      // Avoid connectDB() — it calls process.exit(1) on failure, which aborts Jest.
      await sequelize.authenticate();
      await seedRoles();
      return;
    } catch (error) {
      lastError = error;
      // eslint-disable-next-line no-console
      console.warn(
        `DB authenticate attempt ${attempt}/${retries} failed: ${error.message}`,
      );
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastError;
}

async function getRoleId(name) {
  const role = await Role.findOne({ where: { name } });
  if (!role) throw new Error(`Role missing: ${name}`);
  return role.id;
}

async function createUserWithRole({
  roleName,
  emailSuffix,
  password = "TestPass123!",
  profiles = {},
}) {
  const roleId = await getRoleId(roleName);
  const email = `${QA_PREFIX}${emailSuffix}_${uid()}@example.com`.toLowerCase();
  const hashed = await hashPassword(password);

  const user = await User.unscoped().create({
    activeRoleId: roleId,
    firstName: "QA",
    lastName: roleName,
    email,
    password: hashed,
    isVerified: true,
    status: "active",
    tokenVersion: 0,
  });

  let customer = null;
  let seller = null;
  let admin = null;

  if (profiles.customer || roleName === USER_ROLES.CUSTOMER) {
    customer = await Customer.create({ userId: user.id });
  }
  if (profiles.seller || roleName === USER_ROLES.SELLER) {
    seller = await Seller.create({
      userId: user.id,
      storeName: `QA Store ${uid().slice(0, 6)}`,
      storeDescription: "QA audit store description for testing.",
    });
  }
  if (profiles.admin || roleName === USER_ROLES.ADMIN) {
    admin = await Admin.create({ userId: user.id });
  }

  const tokens = await issueTokenPair(user, roleName, { activeRoleId: roleId });

  return {
    user,
    customer,
    seller,
    admin,
    email,
    password,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    roleName,
  };
}

async function ensureQaCategory() {
  const [category] = await Category.findOrCreate({
    where: { name: QA_CATEGORY_NAME },
    defaults: {
      name: QA_CATEGORY_NAME,
      description: "Created by QA audit suite — safe to delete",
      isActive: true,
    },
  });
  return category;
}

async function createProductForSeller(sellerId, overrides = {}) {
  const category = await ensureQaCategory();
  const product = await Product.create({
    sellerId,
    categoryId: category.id,
    name: overrides.name || `QA Product ${uid().slice(0, 6)}`,
    description: "QA product",
    price: overrides.price ?? 25.5,
    stockType: overrides.stockType || PRODUCT_STOCK_TYPES.UNLIMITED,
    quantity: overrides.quantity ?? null,
    status: overrides.status || PRODUCT_STATUS.ACTIVE,
    isDeleted: false,
  });
  return product;
}

async function cleanupQaData() {
  const users = await User.unscoped().findAll({
    where: { email: { [Op.like]: `${QA_PREFIX}%` } },
    attributes: ["id"],
  });
  const userIds = users.map((u) => u.id);
  if (!userIds.length) {
    await Category.destroy({ where: { name: QA_CATEGORY_NAME } }).catch(() => {});
    return;
  }

  const customers = await Customer.findAll({
    where: { userId: { [Op.in]: userIds } },
    attributes: ["id"],
  });
  const sellers = await Seller.findAll({
    where: { userId: { [Op.in]: userIds } },
    attributes: ["id"],
  });
  const customerIds = customers.map((c) => c.id);
  const sellerIds = sellers.map((s) => s.id);

  const orders = await Order.findAll({
    where: {
      [Op.or]: [
        customerIds.length ? { customerId: { [Op.in]: customerIds } } : null,
        sellerIds.length ? { sellerId: { [Op.in]: sellerIds } } : null,
      ].filter(Boolean),
    },
    attributes: ["id"],
  });
  const orderIds = orders.map((o) => o.id);

  const products = await Product.findAll({
    where: sellerIds.length ? { sellerId: { [Op.in]: sellerIds } } : { id: null },
    attributes: ["id"],
  });
  const productIds = products.map((p) => p.id);

  const conversations = await Conversation.findAll({
    where: {
      [Op.or]: [
        { customerId: { [Op.in]: userIds } },
        { sellerId: { [Op.in]: userIds } },
      ],
    },
    attributes: ["id"],
  });
  const conversationIds = conversations.map((c) => c.id);

  if (conversationIds.length) {
    await Message.destroy({ where: { conversationId: { [Op.in]: conversationIds } } });
    await Conversation.destroy({ where: { id: { [Op.in]: conversationIds } } });
  }

  if (orderIds.length) {
    await Review.destroy({ where: { orderId: { [Op.in]: orderIds } } });
    await SellerCustomerReview.destroy({ where: { orderId: { [Op.in]: orderIds } } });
    await OrderItem.destroy({ where: { orderId: { [Op.in]: orderIds } } });
    await Order.destroy({ where: { id: { [Op.in]: orderIds } } });
  }

  if (customerIds.length) {
    await Review.destroy({ where: { customerId: { [Op.in]: customerIds } } });
    await SellerCustomerReview.destroy({
      where: { customerId: { [Op.in]: customerIds } },
    });
    await Wishlist.destroy({ where: { customerId: { [Op.in]: customerIds } } });
    const carts = await Cart.findAll({
      where: { customerId: { [Op.in]: customerIds } },
      attributes: ["id"],
    });
    const cartIds = carts.map((c) => c.id);
    if (cartIds.length) {
      await CartItem.destroy({ where: { cartId: { [Op.in]: cartIds } } });
      await Cart.destroy({ where: { id: { [Op.in]: cartIds } } });
    }
  }

  if (productIds.length) {
    await ProductImage.destroy({ where: { productId: { [Op.in]: productIds } } });
    await Product.destroy({ where: { id: { [Op.in]: productIds } } });
  }

  const notifications = await Notification.findAll({
    where: { senderId: { [Op.in]: userIds } },
    attributes: ["id"],
  });
  const notificationIds = notifications.map((n) => n.id);
  if (notificationIds.length) {
    await UserNotification.destroy({
      where: { notificationId: { [Op.in]: notificationIds } },
    });
    await Notification.destroy({ where: { id: { [Op.in]: notificationIds } } });
  }
  await UserNotification.destroy({ where: { userId: { [Op.in]: userIds } } });

  await ChatbotRecord.destroy({ where: { userId: { [Op.in]: userIds } } });
  await Address.destroy({ where: { userId: { [Op.in]: userIds } } });
  await RefreshToken.destroy({ where: { userId: { [Op.in]: userIds } } });
  await EmailVerification.destroy({ where: { userId: { [Op.in]: userIds } } });
  await PasswordResetSession.destroy({ where: { userId: { [Op.in]: userIds } } });
  await UserAuthProvider.destroy({ where: { userId: { [Op.in]: userIds } } });
  await Admin.destroy({ where: { userId: { [Op.in]: userIds } } });
  await Customer.destroy({ where: { userId: { [Op.in]: userIds } } });
  await Seller.destroy({ where: { userId: { [Op.in]: userIds } } });
  await User.unscoped().destroy({ where: { id: { [Op.in]: userIds } } });

  await Category.destroy({ where: { name: QA_CATEGORY_NAME } }).catch(() => {});
}

module.exports = {
  QA_PREFIX,
  sequelize,
  connectDB,
  closeDB,
  ensureConnected,
  cleanupQaData,
  createUserWithRole,
  createProductForSeller,
  ensureQaCategory,
  mockReq,
  USER_ROLES,
  uid,
};
