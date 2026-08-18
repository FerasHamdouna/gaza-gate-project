jest.mock("../../config/db.config.js", () => ({
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock("../../models/cart.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/cartItem.model.js", () => ({
  findAll: jest.fn(),
  destroy: jest.fn(),
}));
jest.mock("../../models/customer.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/order.model.js", () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findAndCountAll: jest.fn(),
  findAll: jest.fn(),
  count: jest.fn(),
}));
jest.mock("../../models/orderItem.model.js", () => ({ create: jest.fn() }));
jest.mock("../../models/product.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/productImage.model.js", () => ({}));
jest.mock("../../models/seller.model.js", () => ({
  findOne: jest.fn(),
  findAll: jest.fn(),
  findByPk: jest.fn(),
}));
jest.mock("../../models/address.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/user.model.js", () => ({}));
jest.mock("../../services/notification/notification.service.js", () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
  notifySafely: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/navigation/sellerTrustStats.util.js", () => ({
  getSellersOrderTrustStats: jest.fn().mockResolvedValue(new Map()),
  getSellerOrderTrustStats: jest.fn().mockResolvedValue({
    completedOrders: 12,
    completionRate: 95,
  }),
}));
jest.mock("../../utils/navigation/customerTrustStats.util.js", () => ({
  getCustomersOrderTrustStats: jest.fn().mockResolvedValue(new Map()),
  getCustomerOrderTrustStats: jest.fn().mockResolvedValue({
    completedOrders: 8,
    completionRate: 92,
  }),
}));

const { sequelize } = require("../../config/db.config.js");
const Cart = require("../../models/cart.model.js");
const CartItem = require("../../models/cartItem.model.js");
const Customer = require("../../models/customer.model.js");
const Order = require("../../models/order.model.js");
const OrderItem = require("../../models/orderItem.model.js");
const Product = require("../../models/product.model.js");
const Seller = require("../../models/seller.model.js");
const Address = require("../../models/address.model.js");
const PRODUCT_STATUS = require("../../constants/product/productStatus.constant.js");
const PRODUCT_STOCK_TYPES = require("../../constants/product/stockType.constant.js");
const ORDER_STATUSES = require("../../constants/order/orderStatuses.constant.js");
const USER_ROLES = require("../../constants/user/userRoles.constant.js");
const {
  createOrder,
  getCustomerOrderDetails,
} = require("../../services/order/customerOrder.service.js");
const { getOrderDetails } = require("../../services/order/order.service.js");
const {
  computeOrderTotals,
  assertTotalsConsistent,
} = require("../../utils/order/orderTotals.util.js");

describe("Order totals in services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createOrder", () => {
    const customerReq = {
      user: { id: "user-1", role: "customer" },
      body: { paymentMethod: "cash_on_delivery" },
    };

    const mockTx = {
      LOCK: { UPDATE: "UPDATE" },
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };

    const setupHappyPath = ({ price = 25.5, quantity = 2 } = {}) => {
      sequelize.transaction.mockResolvedValue(mockTx);
      Customer.findOne.mockResolvedValue({ id: "cust-1" });
      Address.findOne.mockResolvedValue({
        neighborhood: "Remal",
        street: "Main",
        notes: null,
      });
      Cart.findOne.mockResolvedValue({ id: "cart-1" });
      CartItem.findAll.mockResolvedValue([
        {
          quantity,
          product: {
            id: "prod-1",
            name: "Olive Oil",
            price,
            stockType: PRODUCT_STOCK_TYPES.UNLIMITED,
            quantity: null,
            status: PRODUCT_STATUS.ACTIVE,
            isDeleted: false,
            sellerId: "seller-1",
          },
        },
      ]);
      Seller.findAll.mockResolvedValue([{ id: "seller-1", userId: "seller-user" }]);
      Product.findOne.mockResolvedValue({
        id: "prod-1",
        name: "Olive Oil",
        price,
        stockType: PRODUCT_STOCK_TYPES.UNLIMITED,
        quantity: null,
        status: PRODUCT_STATUS.ACTIVE,
        isDeleted: false,
        update: jest.fn(),
      });

      const expected = computeOrderTotals({
        items: [{ unitPrice: price, quantity }],
        discountAmount: 0,
        shippingFee: 0,
      });

      Order.create.mockResolvedValue({
        id: "order-1",
        orderNumber: "ORD-123",
        status: ORDER_STATUSES.PENDING_REVIEW,
        subtotal: expected.subtotal,
        totalPrice: expected.totalPrice,
        sellerId: "seller-1",
      });
      OrderItem.create.mockResolvedValue({});
      CartItem.destroy.mockResolvedValue(1);
      Seller.findByPk.mockResolvedValue({ userId: "seller-user" });

      return expected;
    };

    it("persists subtotal, discountAmount, shippingFee, and totalPrice from computeOrderTotals", async () => {
      const expected = setupHappyPath({ price: 25.5, quantity: 2 });

      const result = await createOrder(customerReq);

      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: expected.subtotal,
          discountAmount: 0,
          shippingFee: 0,
          totalPrice: expected.totalPrice,
        }),
        { transaction: mockTx },
      );
      expect(assertTotalsConsistent(expected)).toBe(true);

      expect(result.orders[0]).toEqual(
        expect.objectContaining({
          id: "order-1",
          subtotal: expected.subtotal,
          totalPrice: expected.totalPrice,
          itemsCount: 1,
        }),
      );
    });

    it("locks the cart row inside the transaction before reading items", async () => {
      setupHappyPath();
      await createOrder(customerReq);

      expect(Cart.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: "cust-1" },
          attributes: ["id"],
          transaction: mockTx,
          lock: mockTx.LOCK.UPDATE,
        }),
      );
      expect(CartItem.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cartId: "cart-1" },
          transaction: mockTx,
        }),
      );
    });

    it("rejects empty cart after lock", async () => {
      sequelize.transaction.mockResolvedValue(mockTx);
      Customer.findOne.mockResolvedValue({ id: "cust-1" });
      Address.findOne.mockResolvedValue(null);
      Cart.findOne.mockResolvedValue({ id: "cart-1" });
      CartItem.findAll.mockResolvedValue([]);

      await expect(createOrder(customerReq)).rejects.toMatchObject({
        statusCode: 400,
        message: "Your cart is empty.",
      });
      expect(mockTx.rollback).toHaveBeenCalled();
      expect(Order.create).not.toHaveBeenCalled();
    });

    it("writes OrderItem unitPrice from locked product price", async () => {
      setupHappyPath({ price: 12.75, quantity: 3 });
      await createOrder(customerReq);

      expect(OrderItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          unitPrice: 12.75,
          quantity: 3,
          lineTotal: 38.25,
        }),
        { transaction: mockTx },
      );
    });
  });

  describe("getCustomerOrderDetails", () => {
    it("returns recomputed totals (subtotal, discount, shipping, totalPrice)", async () => {
      Customer.findOne.mockResolvedValue({ id: "cust-1" });
      const getSellerOrderTrustStats =
        require("../../utils/navigation/sellerTrustStats.util.js")
          .getSellerOrderTrustStats;

      Order.findOne.mockResolvedValue({
        id: "order-1",
        orderNumber: "ORD-1",
        status: ORDER_STATUSES.PENDING_REVIEW,
        discountAmount: 5,
        shippingFee: 3,
        totalPrice: 999, // stale — should be overwritten
        paymentMethod: "cash_on_delivery",
        created_at: new Date("2026-08-01"),
        updated_at: new Date("2026-08-01"),
        seller: {
          id: "seller-1",
          storeName: "Gaza Market",
          rating: 4.8,
          ratingCount: 20,
          user: { avatar: "a.png" },
        },
        items: [
          {
            id: "oi-1",
            productId: "prod-1",
            productName: "Oil",
            unitPrice: 40,
            quantity: 2,
            lineTotal: 80,
            product: { images: [{ imageUrl: "img.png" }] },
          },
          {
            id: "oi-2",
            productId: "prod-2",
            productName: "Soap",
            unitPrice: 10,
            quantity: 1,
            lineTotal: 10,
            product: { images: [] },
          },
        ],
      });

      const result = await getCustomerOrderDetails({
        user: { id: "user-1", role: "customer" },
        params: { orderId: "order-1" },
      });

      expect(result.order.subtotal).toBe(90);
      expect(result.order.discountAmount).toBe(5);
      expect(result.order.shippingFee).toBe(3);
      expect(result.order.totalPrice).toBe(88);
      expect(result.order.totalPrice).not.toBe(999);
      expect(assertTotalsConsistent(result.order)).toBe(true);
      expect(result.order.items).toHaveLength(2);
      expect(result.order.items[0].primaryImage).toBe("img.png");
      expect(getSellerOrderTrustStats).toHaveBeenCalledWith("seller-1");
    });
  });

  describe("getOrderDetails (seller)", () => {
    it("overwrites order money fields with computeOrderTotals", async () => {
      Seller.findOne.mockResolvedValue({ id: "seller-1" });
      Order.findOne.mockResolvedValue({
        id: "order-1",
        status: ORDER_STATUSES.PENDING_REVIEW,
        discountAmount: 10,
        shippingFee: 4,
        totalPrice: 1,
        customer: {
          id: "cust-1",
          user: {
            firstName: "Ahmad",
            lastName: "Ali",
            phone: "0599",
            avatar: null,
          },
        },
        toJSON: () => ({
          id: "order-1",
          status: ORDER_STATUSES.PENDING_REVIEW,
          discountAmount: 10,
          shippingFee: 4,
          totalPrice: 1,
          items: [
            { unitPrice: 30, quantity: 2, lineTotal: 60 },
            { unitPrice: 15, quantity: 1, lineTotal: 15 },
          ],
          customer: { id: "cust-1" },
        }),
      });

      const result = await getOrderDetails({
        user: { id: "seller-user", role: USER_ROLES.SELLER },
        params: { orderId: "order-1" },
      });

      expect(result.order.subtotal).toBe(75);
      expect(result.order.discountAmount).toBe(10);
      expect(result.order.shippingFee).toBe(4);
      expect(result.order.totalPrice).toBe(69);
      expect(assertTotalsConsistent(result.order)).toBe(true);
      expect(result.order.customer).toEqual(
        expect.objectContaining({
          id: "cust-1",
          firstName: "Ahmad",
          phone: "0599",
        }),
      );
    });
  });
});
