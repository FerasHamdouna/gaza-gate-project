jest.mock("../../config/db.config.js", () => ({
  sequelize: {
    fn: jest.fn((...args) => ({ fn: args })),
    col: jest.fn((c) => c),
  },
}));

jest.mock("sequelize", () => {
  const actual = jest.requireActual("sequelize");
  return {
    ...actual,
    Sequelize: actual.Sequelize,
    where: jest.fn(),
    fn: jest.fn((...args) => ({ fn: args })),
    col: jest.fn((c) => c),
  };
});

jest.mock("../../models/seller.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/customer.model.js", () => ({}));
jest.mock("../../models/user.model.js", () => ({}));
jest.mock("../../models/review.model.js", () => ({ findAll: jest.fn() }));
jest.mock("../../models/product.model.js", () => ({ count: jest.fn() }));
jest.mock("../../models/address.model.js", () => ({}));
jest.mock("../../models/order.model.js", () => ({
  count: jest.fn(),
  findAll: jest.fn(),
}));
jest.mock("../../utils/navigation/customerTrustStats.util.js", () => ({
  getCustomersOrderTrustStats: jest.fn(),
}));
jest.mock("../../utils/navigation/sellerTrustStats.util.js", () => ({
  getSellerOrderTrustStats: jest.fn(),
}));

const Seller = require("../../models/seller.model.js");
const Review = require("../../models/review.model.js");
const Product = require("../../models/product.model.js");
const Order = require("../../models/order.model.js");
const {
  getCustomersOrderTrustStats,
} = require("../../utils/navigation/customerTrustStats.util.js");
const {
  getSellerOrderTrustStats,
} = require("../../utils/navigation/sellerTrustStats.util.js");
const {
  getDashboard,
} = require("../../services/overview/seller/dashboard.service.js");
const ORDER_STATUSES = require("../../constants/order/orderStatuses.constant.js");

describe("Seller dashboard review/order updates", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Seller.findOne.mockResolvedValue({
      id: "seller-1",
      storeName: "Gaza Market",
      rating: 4.8,
      ratingCount: 25,
      user: { avatar: "seller.png" },
    });

    Order.count.mockResolvedValue(3);
    Product.count.mockResolvedValue(10);

    getSellerOrderTrustStats.mockResolvedValue({
      completedOrders: 15,
      completionRate: 94,
    });
    getCustomersOrderTrustStats.mockResolvedValue(
      new Map([["cust-1", { completedOrders: 6, completionRate: 91 }]]),
    );
  });

  it("includes sellerReply, seller summary, and actionUrls on reviews and orders", async () => {
    Review.findAll
      .mockResolvedValueOnce([
        {
          rating: 5,
          comment: "Excellent",
          sellerReply: "Appreciate it",
          sellerRepliedAt: "2026-07-21T12:00:00.000Z",
          customer: {
            id: "cust-1",
            user: { firstName: "Ahmad", lastName: "Ali", avatar: "c.png" },
          },
          dataValues: { createdAt: new Date("2026-07-20T00:00:00.000Z") },
        },
      ])
      .mockResolvedValueOnce([{ rating: 5, count: "1" }]);

    Order.findAll.mockResolvedValue([
      {
        id: "order-1",
        orderNumber: "ORD-1",
        status: ORDER_STATUSES.PENDING_REVIEW,
        totalPrice: 88.5,
        customer: {
          id: "cust-1",
          user: { firstName: "Ahmad", lastName: "Ali", avatar: "c.png" },
        },
      },
    ]);

    const result = await getDashboard("user-seller-1");

    expect(Seller.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.arrayContaining(["storeName"]),
      }),
    );
    expect(getSellerOrderTrustStats).toHaveBeenCalledWith("seller-1");

    expect(Review.findAll.mock.calls[0][0].attributes).toEqual(
      expect.arrayContaining(["sellerReply", "sellerRepliedAt"]),
    );

    const review = result.rating.reviews[0];
    expect(review.sellerReply).toBe("Appreciate it");
    expect(review.sellerRepliedAt).toBe("2026-07-21T12:00:00.000Z");
    expect(review.actionUrl).toBe("/seller/reviews");
    expect(review.seller).toEqual(
      expect.objectContaining({
        id: "seller-1",
        storeName: "Gaza Market",
        avatar: "seller.png",
        actionUrl: "/store/seller-1",
        isTrustedSeller: true,
      }),
    );
    expect(review.customer).toEqual(
      expect.objectContaining({
        id: "cust-1",
        isTrustedBuyer: true,
      }),
    );

    const order = result.recentOrders[0];
    expect(order.actionUrl).toBe("/seller/orders/order-1");
    expect(order.total).toBe(88.5);
  });

  it("returns null reply fields when missing", async () => {
    Review.findAll
      .mockResolvedValueOnce([
        {
          rating: 4,
          comment: "ok",
          sellerReply: undefined,
          sellerRepliedAt: undefined,
          customer: {
            id: "cust-1",
            user: { firstName: "A", lastName: "B", avatar: null },
          },
          dataValues: { createdAt: new Date("2026-07-20T00:00:00.000Z") },
        },
      ])
      .mockResolvedValueOnce([]);
    Order.findAll.mockResolvedValue([]);

    const result = await getDashboard("user-seller-1");
    expect(result.rating.reviews[0].sellerReply).toBeNull();
    expect(result.rating.reviews[0].sellerRepliedAt).toBeNull();
  });
});
