const {
  roundMoney,
  sumItemsSubtotal,
  computeOrderTotals,
  assertTotalsConsistent,
} = require("../../utils/order/orderTotals.util.js");

describe("orderTotals.util", () => {
  describe("roundMoney", () => {
    it("rounds to 2 decimal places", () => {
      expect(roundMoney(10.456)).toBe(10.46);
      expect(roundMoney(10.454)).toBe(10.45);
    });

    it("treats null/undefined/NaN-like falsy as 0", () => {
      expect(roundMoney(null)).toBe(0);
      expect(roundMoney(undefined)).toBe(0);
      expect(roundMoney("")).toBe(0);
    });

    it("accepts numeric strings", () => {
      expect(roundMoney("12.345")).toBe(12.35);
    });
  });

  describe("sumItemsSubtotal", () => {
    it("sums unitPrice × quantity when both are finite", () => {
      const subtotal = sumItemsSubtotal([
        { unitPrice: 10, quantity: 2 },
        { unitPrice: 5.5, quantity: 3 },
      ]);
      expect(subtotal).toBe(36.5);
    });

    it("falls back to lineTotal when unitPrice/quantity missing", () => {
      const subtotal = sumItemsSubtotal([
        { lineTotal: 20 },
        { unitPrice: "x", quantity: 2, lineTotal: 15 },
      ]);
      expect(subtotal).toBe(35);
    });

    it("prefers unitPrice × quantity even if lineTotal differs", () => {
      expect(
        sumItemsSubtotal([{ unitPrice: 10, quantity: 2, lineTotal: 999 }]),
      ).toBe(20);
    });

    it("returns 0 for empty/undefined items", () => {
      expect(sumItemsSubtotal()).toBe(0);
      expect(sumItemsSubtotal([])).toBe(0);
      expect(sumItemsSubtotal(null)).toBe(0);
    });

    it("rounds floating point noise", () => {
      expect(
        sumItemsSubtotal([{ unitPrice: 0.1, quantity: 3 }]),
      ).toBe(0.3);
    });
  });

  describe("computeOrderTotals", () => {
    it("computes totalPrice = subtotal - discount + shipping", () => {
      const totals = computeOrderTotals({
        items: [
          { unitPrice: 50, quantity: 2 },
          { unitPrice: 25, quantity: 1 },
        ],
        discountAmount: 10,
        shippingFee: 5,
      });

      expect(totals).toEqual({
        subtotal: 125,
        discountAmount: 10,
        shippingFee: 5,
        totalPrice: 120,
      });
    });

    it("defaults discount and shipping to 0 (checkout path)", () => {
      const totals = computeOrderTotals({
        items: [{ unitPrice: 19.99, quantity: 2 }],
      });

      expect(totals.subtotal).toBe(39.98);
      expect(totals.discountAmount).toBe(0);
      expect(totals.shippingFee).toBe(0);
      expect(totals.totalPrice).toBe(39.98);
    });

    it("keeps subtotal and totalPrice in sync with fee fields", () => {
      const totals = computeOrderTotals({
        items: [{ unitPrice: 100, quantity: 1 }],
        discountAmount: 15.555,
        shippingFee: 2.225,
      });

      // Matches Number(value.toFixed(2)) behavior used by roundMoney
      expect(totals.discountAmount).toBe(roundMoney(15.555));
      expect(totals.shippingFee).toBe(roundMoney(2.225));
      expect(totals.totalPrice).toBe(
        roundMoney(totals.subtotal - totals.discountAmount + totals.shippingFee),
      );
      expect(assertTotalsConsistent(totals)).toBe(true);
    });

    it("handles empty items with only shipping", () => {
      const totals = computeOrderTotals({
        items: [],
        shippingFee: 7.5,
      });
      expect(totals).toEqual({
        subtotal: 0,
        discountAmount: 0,
        shippingFee: 7.5,
        totalPrice: 7.5,
      });
    });

    it("recomputes from items so stale stored totalPrice is corrected", () => {
      // Simulates getOrderDetails / getCustomerOrderDetails overwrite path
      const items = [
        { unitPrice: 40, quantity: 2 },
        { unitPrice: 10, quantity: 1 },
      ];
      const totals = computeOrderTotals({
        items,
        discountAmount: 5,
        shippingFee: 3,
      });

      expect(totals.subtotal).toBe(90);
      expect(totals.totalPrice).toBe(88);
      expect(totals.totalPrice).not.toBe(999); // stale DB value would be ignored
    });
  });

  describe("assertTotalsConsistent", () => {
    it("returns true when total matches formula", () => {
      expect(
        assertTotalsConsistent({
          subtotal: 100,
          discountAmount: 10,
          shippingFee: 5,
          totalPrice: 95,
        }),
      ).toBe(true);
    });

    it("returns false when total is out of sync", () => {
      expect(
        assertTotalsConsistent({
          subtotal: 100,
          discountAmount: 10,
          shippingFee: 5,
          totalPrice: 90,
        }),
      ).toBe(false);
    });

    it("tolerates float rounding via roundMoney", () => {
      expect(
        assertTotalsConsistent({
          subtotal: 10.1,
          discountAmount: 0,
          shippingFee: 0.2,
          totalPrice: 10.3,
        }),
      ).toBe(true);
    });
  });
});
