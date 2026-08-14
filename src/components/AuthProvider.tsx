"use client";

import { createContext, useContext } from "react";

/**
 * Whether the visitor is signed in to MyAnimeList.
 *
 * The value is resolved on the server in the root layout and handed down, so
 * the very first paint already shows the right nav. Pages used to discover this
 * themselves via `fetch("/api/auth/me")` in an effect, which meant every page
 * rendered the signed-out button first and corrected itself a moment later.
 */
const AuthContext = createContext(false);

export function AuthProvider({
  initialLoggedIn,
  children,
}: {
  initialLoggedIn: boolean;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={initialLoggedIn}>{children}</AuthContext.Provider>;
}

export function useIsLoggedIn(): boolean {
  return useContext(AuthContext);
}
