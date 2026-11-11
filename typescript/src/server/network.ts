/** Which addresses count as the local network. */

/** Parses a dotted IPv4 address. Returns `null` if it isn't one. */
function parseIPv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return bytes.every((byte) => byte <= 255) ? bytes : null;
}

/** Loopback, private (RFC 1918) or link-local IPv4. */
function isLocalIPv4([a, b]: number[]): boolean {
  return a === 127 || // 127.0.0.0/8 loopback
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254); // 169.254.0.0/16 link-local
}

/**
 * Tells whether an IP address belongs to this machine or a private network:
 * loopback, private (RFC 1918), link-local or IPv6 unique local.
 */
export function isLocalAddress(address: string): boolean {
  const ipv4 = parseIPv4(address);
  if (ipv4) return isLocalIPv4(ipv4);

  const ipv6 = address.toLowerCase();
  const mapped = ipv6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isLocalAddress(mapped[1]);
  return ipv6 === "::1" ||
    /^f[cd][0-9a-f]{2}:/.test(ipv6) || // fc00::/7 unique local
    /^fe[89ab][0-9a-f]:/.test(ipv6); // fe80::/10 link-local
}

/** This machine's private IPv4 addresses, the ones a phone on the same network can reach. */
export function lanAddresses(): string[] {
  return Deno.networkInterfaces()
    .filter(({ family, address }) => family === "IPv4" && !address.startsWith("127."))
    .map(({ address }) => address)
    .filter(isLocalAddress);
}
