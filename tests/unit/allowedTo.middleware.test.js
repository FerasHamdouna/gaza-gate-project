const allowedTo = require("../../middlewares/auth/allowedTo.middleware.js");
const USER_ROLES = require("../../constants/user/userRoles.constant.js");

const mockRes = () => ({});
const run = (middleware, req) =>
  new Promise((resolve) => {
    middleware(req, mockRes(), (err) => resolve(err));
  });

describe("allowedTo middleware", () => {
  it("returns 401 when req.user is missing", async () => {
    const err = await run(allowedTo(USER_ROLES.SELLER), {});
    expect(err.statusCode || err.status).toBe(401);
  });

  it("returns 403 when role is not allowed", async () => {
    const err = await run(allowedTo(USER_ROLES.SELLER), {
      user: { id: "1", role: USER_ROLES.CUSTOMER },
    });
    expect(err.statusCode || err.status).toBe(403);
  });

  it("allows matching role", async () => {
    const err = await run(allowedTo(USER_ROLES.CUSTOMER), {
      user: { id: "1", role: USER_ROLES.CUSTOMER },
    });
    expect(err).toBeUndefined();
  });

  it("allows any of multiple roles", async () => {
    const mw = allowedTo(USER_ROLES.CUSTOMER, USER_ROLES.SELLER);
    expect(
      await run(mw, { user: { id: "1", role: USER_ROLES.SELLER } }),
    ).toBeUndefined();
    expect(
      await run(mw, { user: { id: "1", role: USER_ROLES.ADMIN } }),
    ).toMatchObject({ statusCode: 403 });
  });
});
