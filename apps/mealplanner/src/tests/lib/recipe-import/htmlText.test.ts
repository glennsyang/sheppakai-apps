import { describe, expect, it } from 'vitest';

import { decodeEntities, htmlToText } from '../../../lib/server/recipe-import/html-text';

describe('htmlToText', () => {
	it('keeps readable text, one line per block, and drops scripts and chrome', () => {
		const html = `<html><head><style>p{}</style><script>alert(1)</script></head><body>
			<nav>Home | About</nav>
			<h1>Pea Soup</h1><p>Serves&nbsp;4 &amp; freezes well.</p>
			<ul><li>1 cup peas</li><li>2 cups stock</li></ul>
			<footer>© Site</footer></body></html>`;
		expect(htmlToText(html)).toBe('Pea Soup\nServes 4 & freezes well.\n1 cup peas\n2 cups stock');
	});

	it('caps the length', () => {
		expect(htmlToText(`<p>${'a'.repeat(100)}</p>`, 10)).toHaveLength(10);
	});
});

describe('decodeEntities', () => {
	it('decodes named and numeric entities and leaves unknown ones', () => {
		expect(decodeEntities('&frac12; tsp &#8211; &#x2014; &bogus; &#0;')).toBe(
			'½ tsp – — &bogus; &#0;'
		);
	});
});
