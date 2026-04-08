'use client';

import { useEffect, useRef } from 'react';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_PING_GAP_MS = 60 * 1000;

export default function AppPresenceTracker() {
  const lastPingAtRef = useRef(0);

  useEffect(() => {
    const pingPresence = async (force: boolean = false) => {
      const now = Date.now();
      if (!force && now - lastPingAtRef.current < MIN_PING_GAP_MS) return;
      if (document.visibilityState === 'hidden') return;

      lastPingAtRef.current = now;

      try {
        await fetch('/api/user/presence', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          keepalive: true,
        });
      } catch {
        // Presence tracking should never interrupt the main app experience.
      }
    };

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void pingPresence();
      }
    };

    void pingPresence(true);

    const intervalId = window.setInterval(() => {
      void pingPresence();
    }, HEARTBEAT_INTERVAL_MS);

    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, []);

  return null;
}
