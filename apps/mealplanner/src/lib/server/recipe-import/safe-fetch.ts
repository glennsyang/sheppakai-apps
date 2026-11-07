// Fetch a user-supplied recipe page without letting the URL reach the server's own network
// (SSRF). The address check runs inside the socket's DNS lookup, so the address that is
// checked is the one connected to: a hostname can't pass the check and then rebind to a
// private address. IP-literal hosts skip DNS, so they're checked before connecting.
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** A fetch failure whose message is safe to show the user. */
export class RecipeFetchError extends Error {}

const blocked = new BlockList();
for (const [network, prefix] of [
	['0.0.0.0', 8], // "this" network
	['10.0.0.0', 8], // private
	['100.64.0.0', 10], // carrier-grade NAT
	['127.0.0.0', 8], // loopback
	['169.254.0.0', 16], // link-local, cloud metadata
	['172.16.0.0', 12], // private
	['192.0.0.0', 24], // IETF protocol assignments
	['192.0.2.0', 24], // documentation
	['192.168.0.0', 16], // private
	['198.18.0.0', 15], // benchmarking
	['198.51.100.0', 24], // documentation
	['203.0.113.0', 24], // documentation
	['224.0.0.0', 4], // multicast
	['240.0.0.0', 4] // reserved, broadcast
] as const) {
	blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
	['::', 128], // unspecified
	['::1', 128], // loopback
	['64:ff9b::', 96], // NAT64, can map to private IPv4
	['100::', 64], // discard
	['2001:db8::', 32], // documentation
	['fc00::', 7], // unique local (fly.io's 6PN private network lives here)
	['fe80::', 10], // link-local
	['ff00::', 8] // multicast
] as const) {
	blocked.addSubnet(network, prefix, 'ipv6');
}

/** True for any address that isn't public unicast. Unparseable input counts as blocked. */
export function isBlockedAddress(address: string): boolean {
	const bare = address.replace(/^\[|\]$/g, '');
	const family = isIP(bare);
	if (family === 0) return true;
	if (family === 4) return blocked.check(bare, 'ipv4');
	// IPv4-mapped IPv6 (::ffff:10.0.0.1) is the IPv4 address in disguise.
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
	if (mapped) return blocked.check(mapped[1], 'ipv4');
	if (/^::ffff:/i.test(bare)) return true;
	return blocked.check(bare, 'ipv6');
}

/** Parse and vet a URL before any network access. Throws `RecipeFetchError`. */
export function assertFetchableUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new RecipeFetchError('That doesn’t look like a web address.');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new RecipeFetchError('Only http and https links can be imported.');
	}
	if (url.username || url.password) {
		throw new RecipeFetchError('Links with a username or password can’t be imported.');
	}
	// Default ports only: nothing reaches odd services that happen to listen publicly.
	if (url.port !== '') throw new RecipeFetchError('Links with a port number can’t be imported.');
	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (isIP(host) !== 0 && isBlockedAddress(host)) {
		throw new RecipeFetchError('That address isn’t on the public internet.');
	}
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
		throw new RecipeFetchError('That address isn’t on the public internet.');
	}
	return url;
}

type LookupCallback = (
	err: NodeJS.ErrnoException | null,
	address: string | LookupAddress[],
	family?: number
) => void;

/** `dns.lookup` that refuses to hand the socket a non-public address. */
function guardedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
	dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
		if (err) return callback(err, '');
		const list = addresses;
		if (list.length === 0 || list.some((entry) => isBlockedAddress(entry.address))) {
			return callback(new RecipeFetchError('That address isn’t on the public internet.'), '');
		}
		if (options.all) return callback(null, list);
		callback(null, list[0].address, list[0].family);
	});
}

function decoded(response: http.IncomingMessage): Readable {
	switch (response.headers['content-encoding']?.trim().toLowerCase()) {
		case 'gzip':
		case 'x-gzip':
			return response.pipe(createGunzip());
		case 'deflate':
			return response.pipe(createInflate());
		case 'br':
			return response.pipe(createBrotliDecompress());
		default:
			return response;
	}
}

type Hop = { redirect: string } | { html: string };

function requestOnce(url: URL, signal: AbortSignal): Promise<Hop> {
	const client = url.protocol === 'https:' ? https : http;
	return new Promise((resolve, reject) => {
		const request = client.get(
			url,
			{
				lookup: guardedLookup,
				signal,
				agent: false,
				headers: {
					accept: 'text/html,application/xhtml+xml;q=0.9',
					'accept-encoding': 'gzip, deflate, br',
					'user-agent': 'Mozilla/5.0 (compatible; MealPlannerRecipeImport/1.0)'
				}
			},
			(response) => {
				const status = response.statusCode ?? 0;
				if (status >= 300 && status < 400 && response.headers.location) {
					response.resume();
					return resolve({ redirect: response.headers.location });
				}
				if (status < 200 || status >= 300) {
					response.resume();
					return reject(new RecipeFetchError(`That page answered with an error (${status}).`));
				}
				const type = response.headers['content-type'] ?? '';
				if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
					response.resume();
					return reject(new RecipeFetchError('That link isn’t a web page.'));
				}
				if (Number(response.headers['content-length'] ?? 0) > MAX_BYTES) {
					response.resume();
					return reject(new RecipeFetchError('That page is too large to import.'));
				}

				const body = decoded(response);
				const chunks: Buffer[] = [];
				let size = 0;
				body.on('data', (chunk: Buffer) => {
					size += chunk.length;
					if (size > MAX_BYTES) {
						request.destroy();
						body.destroy();
						reject(new RecipeFetchError('That page is too large to import.'));
						return;
					}
					chunks.push(chunk);
				});
				body.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
				body.on('error', reject);
			}
		);
		request.on('error', reject);
	});
}

/**
 * GET a public web page's HTML: http(s) on default ports, no private addresses at any
 * redirect hop, 10 s overall, 2 MB decoded. Every refusal is a `RecipeFetchError`; network
 * failures are rethrown as one with a generic message.
 */
export async function fetchRecipePage(rawUrl: string): Promise<string> {
	const signal = AbortSignal.timeout(TIMEOUT_MS);
	let url = assertFetchableUrl(rawUrl);
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		let result: Hop;
		try {
			result = await requestOnce(url, signal);
		} catch (err) {
			if (err instanceof RecipeFetchError) throw err;
			if (signal.aborted) throw new RecipeFetchError('That page took too long to load.');
			throw new RecipeFetchError('Couldn’t load that page. Check the link and try again.', {
				cause: err
			});
		}
		if ('html' in result) return result.html;
		url = assertFetchableUrl(new URL(result.redirect, url).href);
	}
	throw new RecipeFetchError('That link redirects too many times.');
}
