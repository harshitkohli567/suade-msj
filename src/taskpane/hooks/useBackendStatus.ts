import { useEffect, useState } from "react";
import { BACKEND_URL } from "../config";

const POLL_INTERVAL_MS = 15000;
const CHECK_TIMEOUT_MS = 4000;

export type BackendStatus = "checking" | "online" | "offline";

export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

      try {
        const response = await fetch(`${BACKEND_URL}/api/health`, { signal: controller.signal });
        if (!cancelled) setStatus(response.ok ? "online" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      } finally {
        clearTimeout(timeout);
      }
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}
