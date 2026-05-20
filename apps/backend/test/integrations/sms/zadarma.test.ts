import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createZadarmaSmsClient } from "../../../src/integrations/sms/zadarma.js";
import { SmsSendError } from "../../../src/integrations/sms/types.js";

const USER_KEY = "test_user_key";
const SECRET_KEY = "test_secret_key_abc123";

describe("ZadarmaSmsClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs form-encoded body to api.zadarma.com/v1/sms/send/ with HMAC auth header", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: "success", messages: 1, cost: 0.05, currency: "USD" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = createZadarmaSmsClient({
      userKey: USER_KEY,
      secretKey: SECRET_KEY,
    });
    const result = await client.send({ to: "+48501234567", body: "Test ASCII" });
    // Zadarma doesn't return a messageId in the success response; we synthesize.
    expect(result.messageId).toMatch(/^zadarma_/);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.zadarma.com/v1/sms/send/");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    const authHeader = (init.headers as Record<string, string>).Authorization;
    expect(authHeader).toMatch(new RegExp(`^${USER_KEY}:[A-Za-z0-9+/=]+$`));
    // Body should be form-encoded, params sorted alphabetically.
    // Zadarma's `to` expects digits without the +.
    expect(init.body).toContain("message=Test%20ASCII");
    expect(init.body).toContain("to=48501234567");
  });

  it("throws SmsSendError on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "error", message: "auth failed" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createZadarmaSmsClient({ userKey: USER_KEY, secretKey: SECRET_KEY });
    await expect(client.send({ to: "+48500000000", body: "x" })).rejects.toBeInstanceOf(
      SmsSendError,
    );
  });

  it("throws SmsSendError when body status is 'error'", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "error", message: "low_balance" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createZadarmaSmsClient({ userKey: USER_KEY, secretKey: SECRET_KEY });
    await expect(client.send({ to: "+48500000000", body: "x" })).rejects.toThrow(/low_balance/);
  });

  it("aborts with SmsSendError after the configured timeout", async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const client = createZadarmaSmsClient({
      userKey: USER_KEY,
      secretKey: SECRET_KEY,
      timeoutMs: 50,
    });
    await expect(client.send({ to: "+48500000000", body: "x" })).rejects.toBeInstanceOf(
      SmsSendError,
    );
  });
});
