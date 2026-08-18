const {
  ensureConnected,
  cleanupQaData,
  closeDB,
  createUserWithRole,
  USER_ROLES,
} = require("../helpers/qaFixtures.js");
const cloudinaryService = require("../../services/integrations/cloudinary.service.js");
const Product = require("../../models/product.model.js");
const ProductImage = require("../../models/productImage.model.js");
const { ensureQaCategory } = require("../helpers/qaFixtures.js");
const PRODUCT_STATUS = require("../../constants/product/productStatus.constant.js");
const PRODUCT_STOCK_TYPES = require("../../constants/product/stockType.constant.js");

jest.setTimeout(120000);

// Minimal 1x1 PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("Phase 5 — Cloudinary round-trip", () => {
  let seller;
  let uploadedPublicId;

  beforeAll(async () => {
    await ensureConnected();
    await cleanupQaData();
    seller = await createUserWithRole({
      roleName: USER_ROLES.SELLER,
      emailSuffix: "cloudinary",
    });
  });

  afterAll(async () => {
    if (uploadedPublicId) {
      await cloudinaryService.deleteImage(uploadedPublicId).catch(() => {});
    }
    await cleanupQaData();
    await closeDB();
  });

  test("upload → persist ProductImage URL → retrieve → delete", async () => {
    const hasCreds =
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET;
    expect(hasCreds).toBeTruthy();

    const upload = await cloudinaryService.uploadImage(
      TINY_PNG,
      `qa_audit/${seller.seller.id}`,
    );
    expect(upload.url).toMatch(/^https?:\/\//);
    expect(upload.publicId).toBeTruthy();
    uploadedPublicId = upload.publicId;

    const category = await ensureQaCategory();
    const product = await Product.create({
      sellerId: seller.seller.id,
      categoryId: category.id,
      name: "QA Cloudinary Product",
      price: 11.11,
      stockType: PRODUCT_STOCK_TYPES.UNLIMITED,
      status: PRODUCT_STATUS.ACTIVE,
    });
    await ProductImage.create({
      productId: product.id,
      imageUrl: upload.url,
      publicId: upload.publicId,
      isPrimary: true,
    });

    const reloaded = await Product.findByPk(product.id, {
      include: [{ model: ProductImage, as: "images" }],
    });
    expect(reloaded.images[0].imageUrl).toBe(upload.url);
    expect(reloaded.images[0].publicId).toBe(upload.publicId);

    await cloudinaryService.deleteImage(upload.publicId);
    uploadedPublicId = null;
  });
});
