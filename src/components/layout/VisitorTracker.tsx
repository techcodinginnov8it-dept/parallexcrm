'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_PING_GAP_MS = 60 * 1000;

export default function VisitorTracker() {
  const pathname = usePathname();
  const lastPingAtRef = useRef(0);

  useEffect(() => {
    const pingVisitor = async (force: boolean = false) => {
      const now = Date.now();
      if (!force && now - lastPingAtRef.current < MIN_PING_GAP_MS) return;
      if (document.visibilityState === 'hidden') return;

      lastPingAtRef.current = now;

      try {
        await fetch('/api/visitor/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: pathname || '/' }),
          cache: 'no-store',
          credentials: 'same-origin',
          keepalive: true,
        });
      } catch {
        // Visitor analytics should never interrupt the main app experience.
      }
    };

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void pingVisitor();
      }
    };

    void pingVisitor(true);

    const intervalId = window.setInterval(() => {
      void pingVisitor();
    }, HEARTBEAT_INTERVAL_MS);

    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, [pathname]);

  return null;
}
