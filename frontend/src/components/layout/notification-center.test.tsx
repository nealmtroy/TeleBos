import { describe, expect, it } from "vitest";

import { type AppNotification } from "@/hooks/use-notifications";

import { getNotificationContent } from "./notification-center";

const translate = (key: string, params?: Record<string, string | number>) =>
  `${key}:${JSON.stringify(params ?? {})}`;

function notification(event: string, data: Record<string, unknown>): AppNotification {
  return {
    id: "notification-1",
    event,
    data,
    kind: "success",
    href: "/orders",
    read_at: null,
    created_at: new Date().toISOString(),
  };
}

describe("notification content", () => {
  it("maps persisted marketplace sale data to localized copy", () => {
    const content = getNotificationContent(
      notification("marketplace.sale_completed", { phone: "+628123" }),
      translate
    );

    expect(content.title).toContain("orders.notificationSaleSuccessTitle");
    expect(content.message).toContain("+628123");
  });

  it("formats marketplace sale with User ID and price detail", () => {
    const content = getNotificationContent(
      notification("marketplace.sale_completed", { telegram_id: 8886409955, price: 5500 }),
      translate
    );

    expect(content.title).toContain("orders.notificationSaleSuccessTitle");
    expect(content.message).toContain("orders.notificationSaleSuccessWithAmountMessage");
    expect(content.message).toContain("User ID 8886409955");
    expect(content.message).toContain("5.500");
  });

  it("formats single account marketplace listing with User ID and price detail", () => {
    const content = getNotificationContent(
      notification("marketplace.listed", { count: 1, telegram_id: 8886409955, price: 5500 }),
      translate
    );

    expect(content.title).toContain("orders.notificationSellListedSingleTitle");
    expect(content.message).toContain("orders.notificationSellListedSingleMessage");
    expect(content.message).toContain("User ID 8886409955");
    expect(content.message).toContain("5.500");
  });

  it("formats marketplace purchase with User ID and price detail", () => {
    const content = getNotificationContent(
      notification("marketplace.purchase_completed", { telegram_id: 8886409955, price: 6000 }),
      translate
    );

    expect(content.title).toContain("orders.notificationBuySuccessTitle");
    expect(content.message).toContain("orders.notificationBuySuccessDetailedMessage");
    expect(content.message).toContain("User ID 8886409955");
    expect(content.message).toContain("6.000");
  });

  it("maps persisted order status data to localized copy", () => {
    const content = getNotificationContent(
      notification("order.status_changed", { service: "Members", status: "Success" }),
      translate
    );

    expect(content.title).toContain("orders.notificationStatusChangedTitle");
    expect(content.message).toContain("Success");
  });

  it("maps wallet topup notifications correctly", () => {
    const created = getNotificationContent(
      notification("wallet.topup_created", { amount: 50000, method: "QRIS" }),
      translate
    );
    expect(created.title).toContain("wallet.notificationTopupCreatedTitle");
    expect(created.message).toContain("50.000");

    const approved = getNotificationContent(
      notification("wallet.topup_approved", { amount: 50000 }),
      translate
    );
    expect(approved.title).toContain("wallet.notificationTopupApprovedTitle");
    expect(approved.message).toContain("50.000");

    const rejected = getNotificationContent(
      notification("wallet.topup_rejected", { amount: 50000 }),
      translate
    );
    expect(rejected.title).toContain("wallet.notificationTopupRejectedTitle");
  });

  it("maps wallet withdraw notifications correctly", () => {
    const created = getNotificationContent(
      notification("wallet.withdraw_created", { amount: 100000, method: "BCA" }),
      translate
    );
    expect(created.title).toContain("wallet.notificationWithdrawCreatedTitle");
    expect(created.message).toContain("100.000");

    const approved = getNotificationContent(
      notification("wallet.withdraw_approved", { amount: 100000 }),
      translate
    );
    expect(approved.title).toContain("wallet.notificationWithdrawApprovedTitle");
    expect(approved.message).toContain("100.000");

    const rejected = getNotificationContent(
      notification("wallet.withdraw_rejected", { amount: 100000 }),
      translate
    );
    expect(rejected.title).toContain("wallet.notificationWithdrawRejectedTitle");
  });

  it("maps wallet adjustment and redeem correctly", () => {
    const adj = getNotificationContent(
      notification("wallet.admin_adjustment", { amount: 25000, action: "penambahan" }),
      translate
    );
    expect(adj.title).toContain("wallet.notificationAdminAdjustmentTitle");
    expect(adj.message).toContain("25.000");

    const redeem = getNotificationContent(
      notification("wallet.redeem_success", { code: "PROMO2026" }),
      translate
    );
    expect(redeem.title).toContain("wallet.notificationRedeemSuccessTitle");
    expect(redeem.message).toContain("PROMO2026");
  });

  it("maps support ticket notification correctly", () => {
    const support = getNotificationContent(
      notification("support_ticket_created", { ticket_number: "TB-12345", sender: "user@example.com" }),
      translate
    );
    expect(support.title).toContain("notifications.supportTicketTitle");
    expect(support.message).toContain("TB-12345");
  });
});
