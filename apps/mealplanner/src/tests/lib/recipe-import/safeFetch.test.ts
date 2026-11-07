import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it, vi } from 'vitest';

// Every hostname "resolves" to loopback, as a DNS-rebinding attacker's would.
vi.mock('node:dns', async (importOriginal) => {
	const dns = await importOriginal<typeof import('node:dns')>();
	return {
		...dns,
		lookup: (
			_host: string,
			_options: unknown,
			callback: (err: null, addresses: { address: string; family: number }[]) => void
		) => callback(null, [{ address: '127.0.0.1', family: 4 }])
	};
});

import {
	assertFetchableUrl,
	fetchRecipePage,
	isBlockedAddress,
	RecipeFetchError
} from '../../../lib/server/recipe-import/safe-fetch';

describe('isBlockedAddress', () => {
	it.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.20.0.1',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'255.255.255.255',
		'::1',
		'::',
		'fd00::1',
		'fdaa:0:1::3',
		'fe80::1',
		'::ffff:127.0.0.1',
		'::ffff:7f00:1',
		'not-an-ip'
	])('blocks %s', (address) => {
		expect(isBlockedAddress(address)).toBe(true);
	});

	it.each(['93.184.216.34', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8'])(
		'allows %s',
		(address) => {
			expect(isBlockedAddress(address)).toBe(false);
		}
	);
});

describe('assertFetchableUrl', () => {
	it('accepts a public http(s) URL', () => {
		expect(assertFetchableUrl('https://example.com/recipe').hostname).toBe('example.com');
	});

	it.each([
		'ftp://example.com/x',
		'file:///etc/passwd',
		'javascript:alert(1)',
		'https://user:pw@example.com/',
		'https://example.com:8443/',
		'http://127.0.0.1/',
		'http://[::1]/',
		'http://169.254.169.254/latest/meta-data',
		'http://localhost/',
		'http://app.internal/',
		'not a url'
	])('rejects %s', (url) => {
		expect(() => assertFetchableUrl(url)).toThrow(RecipeFetchError);
	});
});

describe('fetchRecipePage', () => {
	it('refuses a public-looking hostname that resolves to loopback', async () => {
		await expect(fetchRecipePage('http://recipes.example.com/')).rejects.toThrow(
			'That address isn’t on the public internet.'
		);
	});

	it('never connects to a local server, even by name', async () => {
		let hits = 0;
		const server = createServer((_req, res) => {
			hits++;
			res.end('<html></html>');
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { port } = server.address() as AddressInfo;
		try {
			// The port makes this fail the URL check; the IP alone would too.
			await expect(fetchRecipePage(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(
				RecipeFetchError
			);
			expect(hits).toBe(0);
		} finally {
			server.close();
		}
	});
});
