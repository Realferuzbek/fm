import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ after: vi.fn(), deliver: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/server/notifications", () => ({ deliverNotification: mocks.deliver }));
import { dispatchNotification } from "@/lib/server/dispatch";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("post-persistence delivery mode", () => {
  it("registers an awaited Next after callback", async () => {
    vi.stubEnv("TELEGRAM_DELIVERY_MODE", "after");
    mocks.deliver.mockResolvedValue("sent");
    expect(await dispatchNotification("id")).toBe("pending");
    expect(mocks.deliver).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.deliver).toHaveBeenCalledExactlyOnceWith("id");
  });
  it("awaits delivery directly when fallback mode is selected", async () => {
    vi.stubEnv("TELEGRAM_DELIVERY_MODE", "direct");
    mocks.deliver.mockResolvedValue("sent");
    expect(await dispatchNotification("id")).toBe("sent");
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
