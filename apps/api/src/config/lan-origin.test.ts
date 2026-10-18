import { describe, expect, it } from "vitest";
import { createCorsOrigin } from "./lan-origin";

const CONFIGURED = "http://localhost:5173";

function check(allowLan: boolean, origin: string | undefined) {
  const option = createCorsOrigin(CONFIGURED, allowLan);
  if (typeof option !== "function") return option === origin;
  let allowed: unknown;
  option(origin, (_err, result) => {
    allowed = result;
  });
  return allowed;
}

describe("createCorsOrigin", () => {
  it("is the plain configured origin when LAN origins are off (today's behaviour)", () => {
    expect(createCorsOrigin(CONFIGURED, false)).toBe(CONFIGURED);
  });

  it("allows private LAN origins on the dev port when on", () => {
    for (const origin of [
      "http://192.168.1.20:5173",
      "http://10.0.0.5:5173",
      "http://172.20.10.11:5173",
      CONFIGURED,
    ]) {
      expect(check(true, origin)).toBe(true);
    }
  });

  it("still rejects public addresses, other ports, https, lookalikes and other hosts", () => {
    for (const origin of [
      "http://8.8.8.8:5173",
      "http://172.32.0.1:5173",
      "http://192.168.1.20:3000",
      "https://192.168.1.20:5173",
      "http://192.168.1.20:5173.evil.com",
      "http://evil.com:5173",
      "http://192.168.1.20.evil.com:5173",
    ]) {
      expect(check(true, origin)).toBe(false);
    }
  });
});
