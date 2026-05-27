import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearToken, getToken, getUser, setToken, setUser } from "./auth";

describe("lib/auth", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setToken/getToken roundtrip", () => {
    expect(getToken()).toBeNull();
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
  });

  it("setUser/getUser roundtrip + bad JSON returns null", () => {
    expect(getUser()).toBeNull();
    setUser({ id: "u1", handle: "demo" });
    expect(getUser()).toEqual({ id: "u1", handle: "demo" });

    window.localStorage.setItem("bytedance-aigc.user", "{not json");
    expect(getUser()).toBeNull();
  });

  it("clearToken removes both keys", () => {
    setToken("t");
    setUser({ id: "u1", handle: "demo" });
    clearToken();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });
});
