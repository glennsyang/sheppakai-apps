// Plain text from fetched HTML, for the JSON-LD mapper and the AI fallback. Regex-based on
// purpose: the input is one capped page, and the output only feeds a model or a form for
// review, so a stray tag fragment is harmless.

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '–',
	mdash: '—',
	hellip: '…',
	deg: '°',
	frac12: '½',
	frac14: '¼',
	frac34: '¾',
	rsquo: '’',
	lsquo: '‘',
	rdquo: '”',
	ldquo: '“'
};

function codePoint(value: number, original: string): string {
	return Number.isInteger(value) && value > 0 && value <= 0x10ffff
		? String.fromCodePoint(value)
		: original;
}

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
		if (entity[0] === '#') {
			const hex = entity[1] === 'x' || entity[1] === 'X';
			return codePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10), match);
		}
		return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
	});
}

/** Strip tags from a short HTML fragment (a JSON-LD field) and decode its entities. */
export function stripTags(fragment: string): string {
	return decodeEntities(fragment.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();
}

const DROPPED_BLOCKS =
	/<(script|style|noscript|svg|template|iframe|nav|header|footer|form)\b[\s\S]*?<\/\1\s*>/gi;
const LINE_BREAKS = /<(br|\/p|\/li|\/h[1-6]|\/div|\/tr|\/dt|\/dd)\b[^>]*>/gi;

/** The readable text of a page, one line per block, capped at `maxLength` characters. */
export function htmlToText(html: string, maxLength = 30_000): string {
	const text = decodeEntities(
		html
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(DROPPED_BLOCKS, ' ')
			.replace(LINE_BREAKS, '\n')
			.replace(/<[^>]*>/g, ' ')
	);
	return text
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n')
		.slice(0, maxLength);
}
