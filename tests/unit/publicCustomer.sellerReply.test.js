jest.mock("../../config/db.config.js", () => ({
  sequelize: {},
}));

jest.mock("../../models/customer.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/user.model.js", () => ({}));
jest.mock("../../models/review.model.js", () => ({ findAndCountAll: jest.fn() }));
jest.mock("../../models/seller.model.js", () => ({}));
jest.mock("../../models/sellerCustomerReview.model.js", () => ({}));
jest.mock("../../models/order.model.js", () => ({}));
jest.mock("../../models/orderItem.model.js", () => ({}));
jest.mock("../../models/product.model.js", () => ({}));
jest.mock("../../models/productImage.model.js", () => ({}));
jest.mock("../../utils/navigation/sellerTrustStats.util.js", () => ({
  getSellersOrderTrustStats: jest.fn(),
}));

const Customer = require("../../models/customer.model.js");
const Review = require("../../models/review.model.js");
const {
  getSellersOrderTrustStats,
} = require("../../utils/navigation/sellerTrustStats.util.js");
const {
  getPublicCustomerReviews,
} = require("../../services/profile/publicCustomer.service.js");

describe("publicCustomer sellerReply updates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("selects and returns sellerReply / sellerRepliedAt on product reviews", async () => {
    Customer.findOne.mockResolvedValue({
      id: "cust-1",
      user: {
        firstName: "Ahmad",
        lastName: "Ali",
        avatar: null,
        get: () => "2026-01-01",
      },
    });

    Review.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [
        {
          id: "rev-1",
          rating: 5,
          comment: "منتج ممتاز",
          imageUrl: null,
          sellerReply: "شكراً لك",
          sellerRepliedAt: "2026-07-20T10:00:00.000Z",
          get: (key) =>
            key === "createdAt" ? "2026-07-18T08:00:00.000Z" : null,
          product: {
            id: "prod-1",
            name: "Oil",
            images: [{ imageUrl: "p.png" }],
          },
          seller: {
            id: "seller-1",
            storeName: "Store",
            rating: 4.8,
            ratingCount: 12,
            user: { avatar: "s.png" },
          },
        },
      ],
    });

    getSellersOrderTrustStats.mockResolvedValue(
      new Map([["seller-1", { completedOrders: 12, completionRate: 95 }]]),
    );

    const result = await getPublicCustomerReviews("cust-1", { page: 1 });

    expect(Review.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.arrayContaining([
          "sellerReply",
          "sellerRepliedAt",
        ]),
      }),
    );

    expect(result.reviews[0]).toEqual(
      expect.objectContaining({
        id: "rev-1",
        sellerReply: "شكراً لك",
        sellerRepliedAt: "2026-07-20T10:00:00.000Z",
        seller: expect.objectContaining({
          id: "seller-1",
          storeName: "Store",
          isTrustedSeller: true,
        }),
      }),
    );
  });

  it("returns null reply fields when seller has not replied", async () => {
    Customer.findOne.mockResolvedValue({
      id: "cust-1",
      user: { get: () => null },
    });
    Review.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [
        {
          id: "rev-2",
          rating: 4,
          comment: "ok",
          imageUrl: null,
          sellerReply: undefined,
          sellerRepliedAt: undefined,
          get: () => "2026-07-18T08:00:00.000Z",
          product: null,
          seller: null,
        },
      ],
    });
    getSellersOrderTrustStats.mockResolvedValue(new Map());

    const result = await getPublicCustomerReviews("cust-1");
    expect(result.reviews[0].sellerReply).toBeNull();
    expect(result.reviews[0].sellerRepliedAt).toBeNull();
    expect(result.reviews[0].seller).toBeNull();
  });
});
