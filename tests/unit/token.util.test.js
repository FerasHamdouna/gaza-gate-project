const token = require("../../utils/security/token.util.js");

describe("token.util", () => {
  const prev = {};

  beforeAll(() => {
    prev.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
    prev.REFRESH_SECRET_KEY = process.env.REFRESH_SECRET_KEY;
    prev.PENDING_SECRET_KEY = process.env.PENDING_SECRET_KEY;

    process.env.JWT_SECRET_KEY = "test-access-secret";
    process.env.REFRESH_SECRET_KEY = "test-refresh-secret";
    process.env.PENDING_SECRET_KEY = "test-pending-secret";
  });

  afterAll(() => {
    process.env.JWT_SECRET_KEY = prev.JWT_SECRET_KEY;
    process.env.REFRESH_SECRET_KEY = prev.REFRESH_SECRET_KEY;
    process.env.PENDING_SECRET_KEY = prev.PENDING_SECRET_KEY;
  });

  describe("buildTokenPayload", () => {
    it("builds payload with userId, role, tokenVersion", () => {
      expect(
        token.buildTokenPayload({
          userId: "u1",
          role: "customer",
          tokenVersion: 0,
        }),
      ).toEqual({ userId: "u1", role: "customer", tokenVersion: 0 });
    });

    it("allows tokenVersion 0", () => {
      expect(() =>
        token.buildTokenPayload({
          userId: "u1",
          role: "seller",
          tokenVersion: 0,
        }),
      ).not.toThrow();
    });

    it("throws when required fields missing", () => {
      expect(() =>
        token.buildTokenPayload({ userId: "u1", role: "customer" }),
      ).toThrow(/buildTokenPayload requires/);
      expect(() =>
        token.buildTokenPayload({
          userId: null,
          role: "customer",
          tokenVersion: 1,
        }),
      ).toThrow();
    });
  });

  describe("access token sign/verify", () => {
    it("round-trips a valid access token", () => {
      const payload = token.buildTokenPayload({
        userId: "user-1",
        role: "seller",
        tokenVersion: 2,
      });
      const signed = token.signAccessToken(payload);
      const verified = token.verifyAccessToken(signed);

      expect(verified.userId).toBe("user-1");
      expect(verified.role).toBe("seller");
      expect(verified.tokenVersion).toBe(2);
    });

    it("rejects a token signed with the wrong secret", () => {
      const signed = token.signAccessToken(
        token.buildTokenPayload({
          userId: "u",
          role: "customer",
          tokenVersion: 0,
        }),
      );
      const real = process.env.JWT_SECRET_KEY;
      process.env.JWT_SECRET_KEY = "other-secret";
      expect(() => token.verifyAccessToken(signed)).toThrow();
      process.env.JWT_SECRET_KEY = real;
    });
  });

  describe("refresh vs access secrets", () => {
    it("does not accept a refresh token as an access token", () => {
      const payload = token.buildTokenPayload({
        userId: "u",
        role: "customer",
        tokenVersion: 0,
      });
      const refresh = token.signRefreshToken(payload);
      expect(() => token.verifyAccessToken(refresh)).toThrow();
    });

    it("round-trips refresh and pending tokens", () => {
      const payload = token.buildTokenPayload({
        userId: "u",
        role: "seller",
        tokenVersion: 1,
      });
      expect(token.verifyRefreshToken(token.signRefreshToken(payload)).userId).toBe(
        "u",
      );
      expect(token.verifyPendingToken(token.signPendingToken(payload)).role).toBe(
        "seller",
      );
    });
  });
});
