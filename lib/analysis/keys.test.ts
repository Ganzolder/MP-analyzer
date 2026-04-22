import { describe, it, expect } from "vitest";
import {
  extractOrderKey,
  extractShipmentSuffix,
  isOrderCharge,
  isSubscriptionCharge,
} from "./keys";

describe("extractOrderKey", () => {
  it("возвращает цифры без дефисов как есть", () => {
    expect(extractOrderKey("79224088")).toBe("79224088");
    expect(extractOrderKey("123456789012")).toBe("123456789012");
  });

  it("возвращает префикс до первого дефиса", () => {
    expect(extractOrderKey("79224088-0238")).toBe("79224088");
    expect(extractOrderKey("79224088-0238-3")).toBe("79224088");
    expect(extractOrderKey("0101288328-0079-1")).toBe("0101288328");
  });

  it("возвращает null для пустых значений", () => {
    expect(extractOrderKey("")).toBeNull();
    expect(extractOrderKey(null)).toBeNull();
    expect(extractOrderKey(undefined)).toBeNull();
  });

  it("возвращает null для подписки (дата-дата)", () => {
    expect(extractOrderKey("07.10.25-07.11.25")).toBeNull();
    expect(extractOrderKey("01.11.25-01.12.25")).toBeNull();
  });

  it("чистит от не-цифр в первом блоке", () => {
    expect(extractOrderKey(" 79224088-01 ")).toBe("79224088");
  });

  it("возвращает null если в первом блоке вообще нет цифр", () => {
    expect(extractOrderKey("abc-123")).toBeNull();
  });
});

describe("extractShipmentSuffix", () => {
  it("null для ID без дефисов", () => {
    expect(extractShipmentSuffix("79224088")).toBeNull();
  });

  it("весь остаток после первого дефиса", () => {
    expect(extractShipmentSuffix("79224088-0238")).toBe("0238");
    expect(extractShipmentSuffix("79224088-0238-3")).toBe("0238-3");
  });

  it("null для пустых и подписок", () => {
    expect(extractShipmentSuffix("")).toBeNull();
    expect(extractShipmentSuffix(null)).toBeNull();
    expect(extractShipmentSuffix("07.10.25-07.11.25")).toBeNull();
  });
});

describe("isOrderCharge / isSubscriptionCharge", () => {
  it("isOrderCharge = true для обычных ID", () => {
    expect(isOrderCharge("79224088")).toBe(true);
    expect(isOrderCharge("79224088-0238-3")).toBe(true);
  });

  it("isOrderCharge = false для пустых и подписок", () => {
    expect(isOrderCharge("")).toBe(false);
    expect(isOrderCharge("07.10.25-07.11.25")).toBe(false);
  });

  it("isSubscriptionCharge = true для формата DD.MM.YY-DD.MM.YY", () => {
    expect(isSubscriptionCharge("07.10.25-07.11.25")).toBe(true);
    expect(isSubscriptionCharge("79224088-0238")).toBe(false);
  });
});
