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

  it("maps persisted order status data to localized copy", () => {
    const content = getNotificationContent(
      notification("order.status_changed", { service: "Members", status: "Success" }),
      translate
    );

    expect(content.title).toContain("orders.notificationStatusChangedTitle");
    expect(content.message).toContain("Success");
  });
});
