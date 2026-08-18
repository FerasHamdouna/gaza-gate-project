jest.mock("../../config/db.config.js", () => ({
  sequelize: {
    transaction: jest.fn(),
    fn: jest.fn(),
    col: jest.fn(),
  },
}));

jest.mock("../../models/review.model.js", () => ({
  findAndCountAll: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock("../../models/seller.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/customer.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/user.model.js", () => ({}));
jest.mock("../../models/product.model.js", () => ({
  findOne: jest.fn(),
  count: jest.fn(),
}));
jest.mock("../../models/productImage.model.js", () => ({}));
jest.mock("../../models/order.model.js", () => ({
  findAll: jest.fn(),
  count: jest.fn(),
}));
jest.mock("../../models/orderItem.model.js", () => ({}));
jest.mock("../../services/notification/notification.service.js", () => ({
  createNotification: jest.fn(),
}));
jest.mock("../../services/integrations/cloudinary.service.js", () => ({
  uploadImage: jest.fn(),
  deleteImage: jest.fn(),
}));
jest.mock("../../utils/navigation/customerTrustStats.util.js", () => ({
  getCustomersOrderTrustStats: jest.fn(),
  getCustomerOrderTrustStats: jest.fn(),
}));
jest.mock("../../utils/navigation/sellerTrustStats.util.js", () => ({
  getSellersOrderTrustStats: jest.fn(),
  getSellerOrderTrustStats: jest.fn(),
}));

const Review = require("../../models/review.model.js");
const Seller = require("../../models/seller.model.js");
const Product = require("../../models/product.model.js");
const {
  getCustomersOrderTrustStats,
} = require("../../utils/navigation/customerTrustStats.util.js");
const {
  getSellersOrderTrustStats,
  getSellerOrderTrustStats,
} = require("../../utils/navigation/sellerTrustStats.util.js");
const {
  getProductReviews,
  getSellerProductReviewsBySellerId,
} = require("../../services/review/review.service.js");

const makeReviewRow = (overrides = {}) => ({
  id: "rev-1",
  rating: 5,
  comment: "Great",
  imageUrl: null,
  sellerReply: "Thanks!",
  sellerRepliedAt: "2026-07-20T10:00:00.000Z",
  get: (key) => (key === "createdAt" ? "2026-07-18T08:00:00.000Z" : null),
  customer: {
    id: "cust-1",
    user: { firstName: "Ahmad", lastName: "Ali", avatar: "c.png" },
  },
  seller: {
    id: "seller-1",
    storeName: "Gaza Market",
    rating: 4.9,
    ratingCount: 50,
    user: { avatar: "s.png" },
  },
  product: { id: "prod-1", name: "Oil" },
  ...overrides,
});

describe("Review sellerReply + seller summary updates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCustomersOrderTrustStats.mockResolvedValue(
      new Map([["cust-1", { completedOrders: 10, completionRate: 95 }]]),
    );
    getSellersOrderTrustStats.mockResolvedValue(
      new Map([["seller-1", { completedOrders: 20, completionRate: 96 }]]),
    );
    getSellerOrderTrustStats.mockResolvedValue({
      completedOrders: 20,
      completionRate: 96,
    });
  });

  describe("getProductReviews", () => {
    it("returns sellerReply, sellerRepliedAt, and seller summary with trust", async () => {
      Product.findOne.mockResolvedValue({
        id: "prod-1",
        averageRating: 4.5,
        reviewsCount: 1,
      });

      // getRatingDistribution uses Review.findAll with group
      Review.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [makeReviewRow()],
      });
      Review.findAll.mockResolvedValue([]);

      const result = await getProductReviews("prod-1", { page: 1 });

      expect(Review.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.arrayContaining([
            "sellerReply",
            "sellerRepliedAt",
          ]),
        }),
      );

      const review = result.reviews[0];
      expect(review.sellerReply).toBe("Thanks!");
      expect(review.sellerRepliedAt).toBe("2026-07-20T10:00:00.000Z");
      expect(review.seller).toEqual(
        expect.objectContaining({
          id: "seller-1",
          storeName: "Gaza Market",
          avatar: "s.png",
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
      expect(getSellersOrderTrustStats).toHaveBeenCalled();
    });

    it("nulls reply fields when seller has not replied", async () => {
      Product.findOne.mockResolvedValue({
        id: "prod-1",
        averageRating: 5,
        reviewsCount: 1,
      });
      Review.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          makeReviewRow({
            sellerReply: null,
            sellerRepliedAt: null,
          }),
        ],
      });
      Review.findAll.mockResolvedValue([]);

      const result = await getProductReviews("prod-1");
      expect(result.reviews[0].sellerReply).toBeNull();
      expect(result.reviews[0].sellerRepliedAt).toBeNull();
    });
  });

  describe("getSellerProductReviewsBySellerId", () => {
    it("embeds shared seller summary on every review", async () => {
      Seller.findOne.mockResolvedValue({
        id: "seller-1",
        storeName: "Gaza Market",
        rating: 4.9,
        ratingCount: 50,
        user: { avatar: "s.png" },
      });

      Review.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: [
          makeReviewRow({ id: "rev-1" }),
          makeReviewRow({
            id: "rev-2",
            sellerReply: null,
            sellerRepliedAt: null,
            customer: {
              id: "cust-2",
              user: { firstName: "Sara", lastName: "N", avatar: null },
            },
          }),
        ],
      });
      // getSellerRatingStats / distribution
      Review.findAll.mockResolvedValue([]);

      getCustomersOrderTrustStats.mockResolvedValue(
        new Map([
          ["cust-1", { completedOrders: 10, completionRate: 95 }],
          ["cust-2", { completedOrders: 1, completionRate: 50 }],
        ]),
      );

      const result = await getSellerProductReviewsBySellerId("seller-1");

      expect(Seller.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.arrayContaining(["storeName"]),
        }),
      );
      expect(getSellerOrderTrustStats).toHaveBeenCalledWith("seller-1");

      expect(result.reviews).toHaveLength(2);
      expect(result.reviews[0].seller).toEqual(result.reviews[1].seller);
      expect(result.reviews[0].seller).toEqual(
        expect.objectContaining({
          id: "seller-1",
          storeName: "Gaza Market",
          avatar: "s.png",
          isTrustedSeller: true,
        }),
      );
      expect(result.reviews[0].sellerReply).toBe("Thanks!");
      expect(result.reviews[1].sellerReply).toBeNull();
      expect(result.reviews[1].customer.isTrustedBuyer).toBe(false);
    });
  });
});
