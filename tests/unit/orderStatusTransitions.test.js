const ORDER_STATUSES = require("../../constants/order/orderStatuses.constant");
const {
  STATUS_TRANSITIONS,
} = require("../../constants/order/orderStatusTransitions.constant");

describe("order status transitions", () => {
  const happyPath = [
    ORDER_STATUSES.PENDING_REVIEW,
    ORDER_STATUSES.ACCEPTED,
    ORDER_STATUSES.IN_PRODUCTION,
    ORDER_STATUSES.READY,
    ORDER_STATUSES.COMPLETED,
  ];

  it("allows only the linear advance path", () => {
    for (let i = 0; i < happyPath.length - 1; i += 1) {
      expect(STATUS_TRANSITIONS[happyPath[i]]).toBe(happyPath[i + 1]);
    }
  });

  it("has no further transition from COMPLETED", () => {
    expect(STATUS_TRANSITIONS[ORDER_STATUSES.COMPLETED]).toBeUndefined();
  });

  it("rejects skipping (e.g. pending_review → ready)", () => {
    expect(STATUS_TRANSITIONS[ORDER_STATUSES.PENDING_REVIEW]).not.toBe(
      ORDER_STATUSES.READY,
    );
    expect(STATUS_TRANSITIONS[ORDER_STATUSES.PENDING_REVIEW]).not.toBe(
      ORDER_STATUSES.COMPLETED,
    );
    expect(STATUS_TRANSITIONS[ORDER_STATUSES.ACCEPTED]).not.toBe(
      ORDER_STATUSES.READY,
    );
  });

  it("has no advance transitions for rejected/cancelled", () => {
    expect(STATUS_TRANSITIONS[ORDER_STATUSES.REJECTED]).toBeUndefined();
    expect(STATUS_TRANSITIONS[ORDER_STATUSES.CANCELLED]).toBeUndefined();
  });

  it("never maps a status to itself", () => {
    for (const [from, to] of Object.entries(STATUS_TRANSITIONS)) {
      expect(from).not.toBe(to);
    }
  });
});
