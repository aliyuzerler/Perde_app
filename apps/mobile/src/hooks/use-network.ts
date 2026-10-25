/**
 * Ağ bağlantısı durumu (expo-network) — çevrimdışı ekranları için tek kaynak.
 *
 * Gerçek cihazda NetInfo benzeri olay akışı sağlar; web/test ortamında
 * `isInternetReachable` null dönebilir — bu durumda "bilinmiyor" sayılır
 * ve ekranlar çevrimdışı ekranı zorlamaz (yanlış pozitif engellenir).
 */
import { useCallback, useEffect, useState } from 'react';
import * as Network from 'expo-network';

export type ConnectivityState = 'unknown' | 'online' | 'offline';

interface NetworkState {
  connectivity: ConnectivityState;
  refresh: () => void;
}

async function readConnectivity(): Promise<ConnectivityState> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isInternetReachable === null || state.isInternetReachable === undefined) {
      return 'unknown';
    }
    return state.isInternetReachable ? 'online' : 'offline';
  } catch {
    return 'unknown';
  }
}

export function useNetworkStatus(): NetworkState {
  const [connectivity, setConnectivity] = useState<ConnectivityState>('unknown');

  const refresh = useCallback(() => {
    void readConnectivity().then(setConnectivity);
  }, []);

  useEffect(() => {
    void readConnectivity().then(setConnectivity);
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { connectivity, refresh };
}

/** Çevrimdışı kesin olarak biliniyor mu? (unknown → engel yok). */
export function isDefinitelyOffline(connectivity: ConnectivityState): boolean {
  return connectivity === 'offline';
}
