jest.mock("../../config/db.config.js", () => ({
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock("../../models/product.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/productImage.model.js", () => ({}));
jest.mock("../../models/category.model.js", () => ({}));
jest.mock("../../models/seller.model.js", () => ({}));
jest.mock("../../models/customer.model.js", () => ({}));
jest.mock("../../models/wishlist.model.js", () => ({ findOne: jest.fn() }));
jest.mock("../../models/user.model.js", () => ({}));
jest.mock("../../models/review.model.js", () => ({ findAll: jest.fn() }));
jest.mock("../../services/integrations/cloudinary.service.js", () => ({
  uploadImage: jest.fn(),
  deleteImage: jest.fn(),
}));
jest.mock("../../services/ai/ai.service.js", () => ({
  generateDescription: jest.fn(),
}));
jest.mock("../../utils/security/resolveCustomerIdFromRequest.util.js", () =>
  jest.fn().mockResolvedValue(null),
);
jest.mock("../../utils/navigation/customerTrustStats.util.js", () => ({
  getCustomersOrderTrustStats: jest.fn(),
}));
jest.mock("../../utils/navigation/sellerTrustStats.util.js", () => ({
  getSellersOrderTrustStats: jest.fn(),
  getSellerOrderTrustStats: jest.fn(),
}));

const Product = require("../../models/product.model.js");
const Review = require("../../models/review.model.js");
const Wishlist = require("../../models/wishlist.model.js");
const {
  getCustomersOrderTrustStats,
} = require("../../utils/navigation/customerTrustStats.util.js");
const {
  getSellersOrderTrustStats,
  getSellerOrderTrustStats,
} = require("../../utils/navigation/sellerTrustStats.util.js");
const {
  getProductDetailsPublic,
} = require("../../services/catalog/product.service.js");
const PRODUCT_STATUS = require("../../constants/product/productStatus.constant.js");

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

describe("product review preview sellerReply + seller summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Product.findOne.mockResolvedValue({
      id: PRODUCT_ID,
      name: "Olive Oil",
      description: "desc",
      price: 25,
      stockType: "unlimited",
      quantity: null,
      status: PRODUCT_STATUS.ACTIVE,
      averageRating: 4.5,
      reviewsCount: 2,
      category: { id: "cat-1", name: "Food" },
      images: [],
      seller: {
        id: "seller-1",
        storeName: "Gaza Market",
        rating: 4.9,
        ratingCount: 40,
        user: { avatar: "s.png" },
      },
    });

    Wishlist.findOne.mockResolvedValue(null);
    getSellerOrderTrustStats.mockResolvedValue({
      completedOrders: 20,
      completionRate: 97,
    });
    getCustomersOrderTrustStats.mockResolvedValue(
      new Map([["cust-1", { completedOrders: 8, completionRate: 90 }]]),
    );
    getSellersOrderTrustStats.mockResolvedValue(
      new Map([["seller-1", { completedOrders: 20, completionRate: 97 }]]),
    );
  });

  it("includes sellerReply, sellerRepliedAt, customer + seller summaries in reviews.preview", async () => {
    Review.findAll.mockResolvedValue([
      {
        id: "rev-1",
        rating: 5,
        comment: "Great product",
        imageUrl: null,
        sellerReply: "Thank you",
        sellerRepliedAt: "2026-07-20T10:00:00.000Z",
        get: (key) =>
          key === "createdAt" ? "2026-07-18T08:00:00.000Z" : null,
        customer: {
          id: "cust-1",
          user: { firstName: "Ahmad", lastName: "Ali", avatar: "c.png" },
        },
        seller: {
          id: "seller-1",
          storeName: "Gaza Market",
          rating: 4.9,
          ratingCount: 40,
          user: { avatar: "s.png" },
        },
      },
    ]);

    const result = await getProductDetailsPublic({
      params: { id: PRODUCT_ID },
      user: null,
    });

    expect(Review.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.arrayContaining([
          "sellerReply",
          "sellerRepliedAt",
        ]),
      }),
    );

    const preview = result.reviews.preview[0];
    expect(preview.sellerReply).toBe("Thank you");
    expect(preview.sellerRepliedAt).toBe("2026-07-20T10:00:00.000Z");
    expect(preview.customer).toEqual(
      expect.objectContaining({
        id: "cust-1",
        firstName: "Ahmad",
        isTrustedBuyer: true,
      }),
    );
    expect(preview.seller).toEqual(
      expect.objectContaining({
        id: "seller-1",
        storeName: "Gaza Market",
        avatar: "s.png",
        actionUrl: "/store/seller-1",
        isTrustedSeller: true,
      }),
    );
    expect(getSellersOrderTrustStats).toHaveBeenCalled();
    expect(getCustomersOrderTrustStats).toHaveBeenCalled();
  });

  it("nulls missing reply fields on preview items", async () => {
    Review.findAll.mockResolvedValue([
      {
        id: "rev-2",
        rating: 4,
        comment: "ok",
        imageUrl: null,
        sellerReply: undefined,
        sellerRepliedAt: undefined,
        get: () => "2026-07-18T08:00:00.000Z",
        customer: { id: "cust-1", user: { firstName: "A", lastName: "B" } },
        seller: {
          id: "seller-1",
          storeName: "Gaza Market",
          rating: 4.9,
          ratingCount: 40,
          user: { avatar: null },
        },
      },
    ]);

    const result = await getProductDetailsPublic({
      params: { id: PRODUCT_ID },
    });

    expect(result.reviews.preview[0].sellerReply).toBeNull();
    expect(result.reviews.preview[0].sellerRepliedAt).toBeNull();
  });
});
