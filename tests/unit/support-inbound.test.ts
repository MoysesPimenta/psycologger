import { createHmac } from "crypto";
import {
  extractFromEmail,
  normalizeSubject,
  verifySvixSignature,
} from "@/lib/support-inbound";

describe("extractFromEmail", () => {
  it("returns empty for null/undefined", () => {
    expect(extractFromEmail(null)).toEqual({ email: "", name: null });
    expect(extractFromEmail(undefined)).toEqual({ email: "", name: null });
  });

  it("does NOT mangle a plain address (regression: moyses@konektera.com)", () => {
    expect(extractFromEmail("moyses@konektera.com")).toEqual({
      email: "moyses@konektera.com",
      name: null,
    });
  });

  it("lowercases plain addresses", () => {
    expect(extractFromEmail("Foo@Bar.COM")).toEqual({
      email: "foo@bar.com",
      name: null,
    });
  });

  it("strips stray quotes and whitespace", () => {
    expect(extractFromEmail('  "user@x.com" ')).toEqual({
      email: "user@x.com",
      name: null,
    });
  });

  it("parses Name <email> form", () => {
    expect(extractFromEmail('"Jane Doe" <jane@x.com>')).toEqual({
      email: "jane@x.com",
      name: "Jane Doe",
    });
    expect(extractFromEmail("Jane Doe <jane@x.com>")).toEqual({
      email: "jane@x.com",
      name: "Jane Doe",
    });
  });

  it("handles object form", () => {
    expect(
      extractFromEmail({ email: "Jane@X.com", name: " Jane " })
    ).toEqual({ email: "jane@x.com", name: "Jane" });
  });

  it("returns null name when missing", () => {
    expect(extractFromEmail({ email: "x@y.com" })).toEqual({
      email: "x@y.com",
      name: null,
    });
  });
});

describe("normalizeSubject", () => {
  it("strips Re:/Fwd:/Enc: prefixes", () => {
    expect(normalizeSubject("Re: Re: Hello")).toBe("hello");
    expect(normalizeSubject("FWD: subject")).toBe("subject");
    expect(normalizeSubject("Enc: Olá")).toBe("olá");
  });

  it("collapses whitespace and lowercases", () => {
    expect(normalizeSubject("  Foo   Bar  ")).toBe("foo bar");
  });

  it("caps at 200 chars", () => {
    expect(normalizeSubject("a".repeat(500)).length).toBe(200);
  });
});

describe("verifySvixSignature", () => {
  // Generate a real Svix-format signature so the verifier can be exercised
  // end-to-end without mocking crypto.
  const secret = "whsec_" + Buffer.from("0123456789abcdef").toString("base64");
  const payload = JSON.stringify({ hello: "world" });
  const svixId = "msg_test_id";
  const timestamp = "1700000000";
  const keyBytes = Buffer.from(
    secret.slice(6),
    "base64"
  );
  const signed = `${svixId}.${timestamp}.${payload}`;
  const sig = createHmac("sha256", keyBytes).update(signed).digest("base64");

  it("accepts a correct v1 signature", () => {
    expect(
      verifySvixSignature(payload, timestamp, `v1,${sig}`, secret, svixId)
    ).toBe(true);
  });

  it("accepts when multiple sigs are present (rotation)", () => {
    expect(
      verifySvixSignature(
        payload,
        timestamp,
        `v1,wrongsig v1,${sig}`,
        secret,
        svixId
      )
    ).toBe(true);
  });

  it("rejects a tampered payload", () => {
    expect(
      verifySvixSignature(
        payload + "tamper",
        timestamp,
        `v1,${sig}`,
        secret,
        svixId
      )
    ).toBe(false);
  });

  it("rejects a tampered timestamp", () => {
    expect(
      verifySvixSignature(payload, "1700000001", `v1,${sig}`, secret, svixId)
    ).toBe(false);
  });

  it("rejects a tampered svixId", () => {
    expect(
      verifySvixSignature(payload, timestamp, `v1,${sig}`, secret, "other_id")
    ).toBe(false);
  });

  it("rejects when secret is wrong", () => {
    expect(
      verifySvixSignature(
        payload,
        timestamp,
        `v1,${sig}`,
        "whsec_" + Buffer.from("wrongkey").toString("base64"),
        svixId
      )
    ).toBe(false);
  });

  it("rejects garbage signature header", () => {
    expect(
      verifySvixSignature(payload, timestamp, "garbage", secret, svixId)
    ).toBe(false);
  });
});
