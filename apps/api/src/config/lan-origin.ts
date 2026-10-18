import type { CorsOptions } from "cors";

// Browser origins from private IPv4 ranges (192.168/16, 10/8, 172.16/12) on the dev web port.
const LAN_ORIGIN =
  /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$/;

/**
 * CORS origin check. Always allows the configured origin; with `allowLan` (development only,
 * enforced in env.ts) it also allows LAN origins. Never a wildcard.
 */
export function createCorsOrigin(configured: string, allowLan: boolean): CorsOptions["origin"] {
  if (!allowLan) return configured;
  return (origin, callback) => {
    callback(null, origin === configured || (origin !== undefined && LAN_ORIGIN.test(origin)));
  };
}
