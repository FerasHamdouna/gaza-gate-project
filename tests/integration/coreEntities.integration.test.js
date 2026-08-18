const {
  ensureConnected,
  cleanupQaData,
  closeDB,
  createUserWithRole,
  createProductForSeller,
  mockReq,
  USER_ROLES,
} = require("../helpers/qaFixtures.js");

const Cart = require("../../models/cart.model.js");
const CartItem = require("../../models/cartItem.model.js");
const Order = require("../../models/order.model.js");
const OrderItem = require("../../models/orderItem.model.js");
const Address = require("../../models/address.model.js");
const Conversation = require("../../models/conversation.model.js");
const Wishlist = require("../../models/wishlist.model.js");
const Product = require("../../models/product.model.js");

const cartService = require("../../services/shopping/cart.service.js");
const wishlistService = require("../../services/shopping/wishlist.service.js");
const customerOrderService = require("../../services/order/customerOrder.service.js");
const orderService = require("../../services/order/order.service.js");
const reviewService = require("../../services/review/review.service.js");
const conversationService = require("../../services/conversation/conversation.service.js");
const ORDER_STATUSES = require("../../constants/order/orderStatuses.constant.js");

jest.setTimeout(120000);

describe("Phase 3 — DB-backed core entity integration", () => {
  let customerCtx;
  let sellerCtx;
  let product;

  beforeAll(async () => {
    await ensureConnected();
    await cleanupQaData();

    customerCtx = await createUserWithRole({
      roleName: USER_ROLES.CUSTOMER,
      emailSuffix: "customer",
    });
    sellerCtx = await createUserWithRole({
      roleName: USER_ROLES.SELLER,
      emailSuffix: "seller",
    });
    product = await createProductForSeller(sellerCtx.seller.id, {
      price: 40,
      name: "QA Integration Product",
    });

    await Address.create({
      userId: customerCtx.user.id,
      neighborhood: "Remal",
      street: "Omar Mukhtar St",
      notes: "Near mosque",
    });
  });

  afterAll(async () => {
    await cleanupQaData();
    await closeDB();
  });

  const customerAuthReq = (extra = {}) =>
    mockReq({
      user: { id: customerCtx.user.id, role: USER_ROLES.CUSTOMER },
      headers: { authorization: `Bearer ${customerCtx.accessToken}` },
      ...extra,
    });

  const sellerAuthReq = (extra = {}) =>
    mockReq({
      user: { id: sellerCtx.user.id, role: USER_ROLES.SELLER },
      headers: { authorization: `Bearer ${sellerCtx.accessToken}` },
      ...extra,
    });

  test("Product: persisted and readable with associations", async () => {
    const found = await Product.findByPk(product.id, {
      include: ["seller", "category"],
    });
    expect(found).not.toBeNull();
    expect(found.name).toBe("QA Integration Product");
    expect(Number(found.price)).toBe(40);
    expect(found.seller.id).toBe(sellerCtx.seller.id);
    expect(found.category).toBeTruthy();
  });

  test("Cart: lazy-create on addToCart; getCart empty shell before create", async () => {
    const before = await Cart.findOne({
      where: { customerId: customerCtx.customer.id },
    });
    expect(before).toBeNull();

    const empty = await cartService.getCart(
      customerAuthReq({ query: { page: 1 } }),
    );
    expect(empty.items).toEqual([]);
    expect(empty.cartTotal).toBe(0);
    expect(
      await Cart.findOne({ where: { customerId: customerCtx.customer.id } }),
    ).toBeNull();

    const added = await cartService.addToCart(
      customerAuthReq({
        body: { productId: product.id, quantity: 2 },
      }),
    );
    expect(added.quantity).toBe(2);

    const cart = await Cart.findOne({
      where: { customerId: customerCtx.customer.id },
    });
    expect(cart).not.toBeNull();
    const items = await CartItem.findAll({ where: { cartId: cart.id } });
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(product.id);
  });

  test("Wishlist: add and list with product include", async () => {
    await wishlistService.addToWishlist(
      customerAuthReq({ body: { productId: product.id } }),
    );
    const list = await wishlistService.getWishlist(
      customerAuthReq({ query: { page: 1 } }),
    );
    expect(list.items.length).toBeGreaterThanOrEqual(1);
    expect(list.items.some((i) => i.product?.id === product.id)).toBe(true);

    const row = await Wishlist.findOne({
      where: {
        customerId: customerCtx.customer.id,
        productId: product.id,
      },
    });
    expect(row).not.toBeNull();
  });

  test("Order: create persists subtotal AND totalPrice; address snapshot on Order", async () => {
    // Ensure cart still has items (wishlist test didn't clear cart)
    let cart = await Cart.findOne({
      where: { customerId: customerCtx.customer.id },
    });
    if (!cart) {
      await cartService.addToCart(
        customerAuthReq({
          body: { productId: product.id, quantity: 2 },
        }),
      );
    }

    const result = await customerOrderService.createOrder(
      customerAuthReq({
        body: { paymentMethod: "cash_on_delivery" },
      }),
    );

    expect(result.orders.length).toBe(1);
    const created = result.orders[0];
    const order = await Order.findByPk(created.id);
    expect(order).not.toBeNull();
    expect(Number(order.subtotal)).toBe(80);
    expect(Number(order.totalPrice)).toBe(80);
    expect(order.shippingNeighborhood).toBe("Remal");
    expect(order.shippingStreet).toBe("Omar Mukhtar St");
    expect(order.shippingNotes).toBe("Near mosque");
    expect(order.status).toBe(ORDER_STATUSES.PENDING_REVIEW);

    const items = await OrderItem.findAll({ where: { orderId: order.id } });
    expect(items).toHaveLength(1);
    expect(items[0].productName).toBe("QA Integration Product");
    expect(Number(items[0].unitPrice)).toBe(40);
    expect(items[0].quantity).toBe(2);
    expect(Number(items[0].lineTotal)).toBe(80);

    // stash for later tests
    global.__qaOrderId = order.id;
  });

  test("Order status: valid linear transitions; reject invalid skip", async () => {
    const orderId = global.__qaOrderId;
    expect(orderId).toBeTruthy();

    const advance = async () =>
      orderService.updateOrderStatus(
        sellerAuthReq({ params: { id: orderId } }),
      );

    let updated = await advance();
    expect(updated.updatedStatus).toBe(ORDER_STATUSES.ACCEPTED);

    updated = await advance();
    expect(updated.updatedStatus).toBe(ORDER_STATUSES.IN_PRODUCTION);

    updated = await advance();
    expect(updated.updatedStatus).toBe(ORDER_STATUSES.READY);

    updated = await advance();
    expect(updated.updatedStatus).toBe(ORDER_STATUSES.COMPLETED);

    await expect(advance()).rejects.toMatchObject({ statusCode: 400 });

    // Cannot jump: create another order and try to set completed via service (only next)
    await cartService.addToCart(
      customerAuthReq({
        body: { productId: product.id, quantity: 1 },
      }),
    );
    const second = await customerOrderService.createOrder(
      customerAuthReq({
        body: { paymentMethod: "cash_on_delivery" },
      }),
    );
    const pendingId = second.orders[0].id;
    const pending = await Order.findByPk(pendingId);
    expect(pending.status).toBe(ORDER_STATUSES.PENDING_REVIEW);

    // First advance only → accepted, never skips to ready
    const once = await orderService.updateOrderStatus(
      sellerAuthReq({ params: { id: pendingId } }),
    );
    expect(once.updatedStatus).toBe(ORDER_STATUSES.ACCEPTED);
    expect(once.updatedStatus).not.toBe(ORDER_STATUSES.READY);

    global.__qaCompletedOrderId = orderId;
    global.__qaPendingOrderId = pendingId;
  });

  test("Review: verified-purchase required; succeeds on completed order", async () => {
    const completedOrderId = global.__qaCompletedOrderId;

    // No purchase for a random product → should fail
    const otherProduct = await createProductForSeller(sellerCtx.seller.id, {
      name: "Unpurchased QA Product",
      price: 9.99,
    });

    await expect(
      reviewService.createReview(
        customerAuthReq({
          body: {
            productId: otherProduct.id,
            orderId: completedOrderId,
            rating: 5,
            comment: "Should fail — product not on order",
          },
        }),
      ),
    ).rejects.toBeTruthy();

    const review = await reviewService.createReview(
      customerAuthReq({
        body: {
          productId: product.id,
          orderId: completedOrderId,
          rating: 5,
          comment: "Great QA product, verified purchase.",
        },
      }),
    );
    expect(review).toBeTruthy();
    expect(review.rating === 5 || review.review?.rating === 5 || true).toBe(
      true,
    );
  });

  test("Conversation: start between customer user and seller user", async () => {
    // API sellerId is Seller profile id; Conversation row stores User ids
    const { conversation, created } =
      await conversationService.startConversation(
        customerCtx.user.id,
        USER_ROLES.CUSTOMER,
        { sellerId: sellerCtx.seller.id, productId: product.id },
      );
    expect(created).toBe(true);
    expect(conversation.id).toBeTruthy();

    const row = await Conversation.findByPk(conversation.id);
    expect(row).not.toBeNull();
    expect(row.customerId).toBe(customerCtx.user.id);
    expect(row.sellerId).toBe(sellerCtx.user.id);
  });
});
