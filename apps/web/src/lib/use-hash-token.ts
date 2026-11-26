'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reads `#token=…` once, then removes it from the address bar so the token
 * doesn't stay in history, screenshots or the Referer header.
 * Returns undefined while reading, null when absent.
 */
export function useHashToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // Survives React StrictMode's double effect run (the hash is gone the second time).
  const read = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (read.current === undefined) {
      read.current = new URLSearchParams(window.location.hash.slice(1)).get('token');
      if (read.current) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
    setToken(read.current);
  }, []);
  return token;
}
