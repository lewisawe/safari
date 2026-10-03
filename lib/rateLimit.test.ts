import { describe, it, expect } from "vitest";
import { clientIp, createRateLimiter, intFromEnv } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit per key per window, then denies", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 10).allowed).toBe(true);
    const third = rl.check("a", 20);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(rl.isLimited("a", 30)).toBe(true);
  });

  it("keeps keys independent", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 0).allowed).toBe(false);
    expect(rl.check("b", 0).allowed).toBe(true);
  });

  it("opens a fresh window after the old one expires", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("a", 999).allowed).toBe(false);
    expect(rl.isLimited("a", 1000)).toBe(false);
    expect(rl.check("a", 1000).allowed).toBe(true);
  });

  it("isLimited never counts a request", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    for (let i = 0; i < 5; i++) expect(rl.isLimited("a", 0)).toBe(false);
    expect(rl.check("a", 0).allowed).toBe(true);
  });

  it("limit 0 denies everything", () => {
    const rl = createRateLimiter({ limit: 0, windowMs: 1000 });
    expect(rl.check("a", 0).allowed).toBe(false);
    expect(rl.isLimited("a", 0)).toBe(true);
  });

  it("stays bounded: sweeps expired windows, then evicts the oldest key", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
    rl.check("a", 0);
    rl.check("b", 0);
    rl.check("c", 500);
    expect(rl.size()).toBe(3);
    // a and b expired at 1000: both swept, size never exceeds the bound.
    rl.check("d", 1200);
    expect(rl.size()).toBe(2);
    rl.check("e", 1200);
    rl.check("f", 1200); // full of live windows: oldest ("c") is evicted
    expect(rl.size()).toBe(3);
    expect(rl.isLimited("c", 1200)).toBe(false);
    expect(rl.isLimited("d", 1200)).toBe(true);
    for (let i = 0; i < 100; i++) rl.check(`k${i}`, 1300);
    expect(rl.size()).toBe(3);
  });
});

describe("clientIp", () => {
  const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });
  it("uses the first x-forwarded-for hop", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIp(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("intFromEnv", () => {
  it("parses non-negative integers and falls back otherwise", () => {
    expect(intFromEnv(undefined, 5)).toBe(5);
    expect(intFromEnv("", 5)).toBe(5);
    expect(intFromEnv("0", 5)).toBe(0);
    expect(intFromEnv("12", 5)).toBe(12);
    expect(intFromEnv("-1", 5)).toBe(5);
    expect(intFromEnv("abc", 5)).toBe(5);
    expect(intFromEnv("1.5", 5)).toBe(5);
  });
});
