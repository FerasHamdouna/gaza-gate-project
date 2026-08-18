const {
  hashPassword,
  comparePassword,
} = require("../../utils/security/password.util.js");

describe("password.util", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("Secret123!");
    expect(hash).not.toBe("Secret123!");
    expect(await comparePassword("Secret123!", hash)).toBe(true);
    expect(await comparePassword("wrong", hash)).toBe(false);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});
