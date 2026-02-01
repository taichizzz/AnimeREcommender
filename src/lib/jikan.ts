import { Agent, setGlobalDispatcher } from "undici";

// Force IPv4 DNS result order for all fetch requests in this server process
setGlobalDispatcher(new Agent({ connect: { lookup: (hostname, options, cb) => {
  // Use Node's dns.lookup with IPv4 preference
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dns = require("dns");
  dns.lookup(hostname, { ...options, family: 4 }, cb);
}}}));

const JIKAN_BASE = "https://api.jikan.moe/v4";

export async function jikanGet<T>(path: string): Promise<T> {
  const url = `${JIKAN_BASE}${path}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jikan error ${res.status}: ${res.statusText}\n${text}`);
  }

  return (await res.json()) as T;
}