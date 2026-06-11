"use client";

import { useSyncExternalStore } from "react";
import type { AuthUser } from "./auth";

interface AuthSnapshot {
  user: AuthUser | null;
  hasToken: boolean;
}

const EMPTY: AuthSnapshot = { user: null, hasToken: false };

let cachedSnap: AuthSnapshot = EMPTY;

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function readAuth(): AuthSnapshot {
  if (typeof window === "undefined") return EMPTY;
  const token = window.localStorage.getItem("bytedance-aigc.accessToken");
  const userRaw = window.localStorage.getItem("bytedance-aigc.user");
  const hasToken = !!token;
  const userId = cachedSnap.user?.id ?? null;
  const userHandle = cachedSnap.user?.handle ?? null;
  const userRole = cachedSnap.user?.role ?? null;
  let parsed: AuthUser | null = null;
  if (userRaw) {
    try {
      parsed = JSON.parse(userRaw) as AuthUser;
    } catch {
      parsed = null;
    }
  }
  if (
    cachedSnap.hasToken === hasToken &&
    userId === (parsed?.id ?? null) &&
    userHandle === (parsed?.handle ?? null) &&
    userRole === (parsed?.role ?? null)
  ) {
    return cachedSnap;
  }
  cachedSnap = { user: parsed, hasToken };
  return cachedSnap;
}

function getServerSnapshot(): AuthSnapshot {
  return EMPTY;
}

export function useAuthSnapshot() {
  const snap = useSyncExternalStore(subscribe, readAuth, getServerSnapshot);
  return {
    user: snap.user,
    hasToken: snap.hasToken,
    isLoggedIn: snap.hasToken && !!snap.user,
  };
}
