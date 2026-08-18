const refreshTokenCookieOptions = require("../../utils/security/cookieOptions.util.js");

describe("refreshTokenCookieOptions", () => {
  it("sets httpOnly, secure, and sameSite=none for cross-site SPA", () => {
    expect(refreshTokenCookieOptions).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
  });

  it("uses a 30-day maxAge matching refresh TTL", () => {
    expect(refreshTokenCookieOptions.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
