#!/usr/bin/env node

// Checks Brevo's transactional email event log for a given recipient.
// Usage:
//   node scripts/check-email-log.mjs --email someone@example.com [--days 14] [--event delivered] [--limit 50]
//
// Reads BREVO_API_KEY from the environment, falling back to .env in the repo root.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const EVENTS_URL = 'https://api.brevo.com/v3/smtp/statistics/events';

function parseArgs(argv) {
	const args = { days: 14, limit: 50 };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--email') args.email = argv[++i];
		else if (arg === '--event') args.event = argv[++i];
		else if (arg === '--days') args.days = Number(argv[++i]);
		else if (arg === '--limit') args.limit = Number(argv[++i]);
		else if (arg === '--message-id') args.messageId = argv[++i];
		else if (arg === '--help' || arg === '-h') args.help = true;
	}
	return args;
}

function printUsageAndExit(code) {
	console.log(
		'Usage: node scripts/check-email-log.mjs --email <address> [--days 14] [--event <event>] [--message-id <id>] [--limit 50]\n' +
			'Events: bounces, hardBounces, softBounces, delivered, spam, requests, opens, clicks, invalid, deferred, blocked, unsubscribed, error'
	);
	process.exit(code);
}

function loadApiKey() {
	if (process.env.BREVO_API_KEY) return process.env.BREVO_API_KEY;

	const envPath = path.join(process.cwd(), '.env');
	if (!fs.existsSync(envPath)) return undefined;

	const match = fs
		.readFileSync(envPath, 'utf8')
		.split('\n')
		.find((line) => line.startsWith('BREVO_API_KEY='));
	if (!match) return undefined;

	return match
		.slice('BREVO_API_KEY='.length)
		.trim()
		.replace(/^['"]|['"]$/g, '');
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help || !args.email) printUsageAndExit(args.help ? 0 : 1);

	const apiKey = loadApiKey();
	if (!apiKey) {
		console.error('No BREVO_API_KEY found in the environment or ./.env. Run this from the repo root.');
		process.exit(1);
	}

	const params = new URLSearchParams({
		email: args.email,
		days: String(args.days),
		limit: String(args.limit),
		sort: 'desc'
	});
	if (args.event) params.set('event', args.event);
	if (args.messageId) params.set('messageId', args.messageId);

	const response = await fetch(`${EVENTS_URL}?${params}`, {
		headers: { accept: 'application/json', 'api-key': apiKey }
	});

	const body = await response.json();

	if (!response.ok) {
		console.error(`Brevo API error (${response.status}):`, body.message ?? body);
		process.exit(1);
	}

	const events = body.events ?? [];
	if (events.length === 0) {
		console.log(`No events found for ${args.email} in the last ${args.days} day(s).`);
		console.log('This usually means the send was never attempted — check the app logs/Sentry too.');
		return;
	}

	console.log(`${events.length} event(s) for ${args.email} in the last ${args.days} day(s):\n`);
	for (const event of events) {
		console.log(
			`${event.date}  ${event.event.padEnd(12)}  subject="${event.subject ?? ''}"  messageId=${event.messageId ?? 'n/a'}`
		);
	}
}

main().catch((error) => {
	console.error('Failed to check email log:', error);
	process.exit(1);
});
