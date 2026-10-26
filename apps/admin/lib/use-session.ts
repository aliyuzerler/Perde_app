"use client";

import { useSyncExternalStore } from "react";
import { readSession } from "./api";

/**
 * ADMIN rolünü `useSyncExternalStore` ile okur.
 *
 * Neden: prerender sırasında localStorage yoktur. `readSession()` render
 * anında çağrılırsa sunucuda her zaman `false` üretilip hidrasyonda
 * uyuşmazlık çıkar; effect'te setState ise `react-hooks/set-state-in-effect`
 * kuralına aykırıdır. `useSyncExternalStore` her iki sorunu da çözer:
 * sunucu anlık görüntüsü sabit `false`, istemci anlık görüntüsü gerçek rol.
 *
 * Oturum yalnızca giriş/çıkışta değişir ve bu geçişler sayfa gezinmesi
 * yarattığından abonelik gerekmez (no-op subscribe yeterlidir).
 */
const subscribeSession = () => () => {};
const getClientSnapshot = () => readSession()?.user.role === "ADMIN";
const getServerSnapshot = () => false;

export function useIsAdmin(): boolean {
  return useSyncExternalStore(subscribeSession, getClientSnapshot, getServerSnapshot);
}
