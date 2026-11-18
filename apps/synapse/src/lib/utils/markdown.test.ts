import { describe, expect, it } from 'vitest';

import {
	createMarkdownExcerpt,
	createMatchExcerpt,
	markdownToPlainText,
	renderMarkdownToSafeHtml
} from './markdown';

describe('markdown utilities', () => {
	it('renders markdown formatting as html', () => {
		const html = renderMarkdownToSafeHtml('# Heading\n\n**Bold** text');

		expect(html).toContain('<h1>Heading</h1>');
		expect(html).toContain('<strong>Bold</strong>');
	});

	it('escapes raw html input for safe rendering', () => {
		const html = renderMarkdownToSafeHtml('<script>alert("xss")</script>');

		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
	});

	it('converts markdown to plain text', () => {
		const plainText = markdownToPlainText('Hello **world**. Visit [Synapse](https://example.com).');

		expect(plainText).toBe('Hello world. Visit Synapse.');
	});

	it('creates bounded excerpts from markdown', () => {
		const excerpt = createMarkdownExcerpt('One two three four five six seven eight nine ten', 18);

		expect(excerpt).toBe('One two three...');
	});

	it('returns empty excerpt for empty markdown', () => {
		expect(createMarkdownExcerpt('', 20)).toBe('');
	});

	describe('createMatchExcerpt', () => {
		const filler = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');

		it('returns the whole text untruncated when it fits', () => {
			expect(createMatchExcerpt('Short **entry**', 'entry', 50)).toEqual({
				excerpt: 'Short entry',
				truncated: false
			});
		});

		it('uses the leading excerpt when there is no query', () => {
			const result = createMatchExcerpt(filler, '', 40);

			expect(result.truncated).toBe(true);
			expect(result.excerpt.startsWith('word0 word1')).toBe(true);
			expect(result.excerpt.endsWith('...')).toBe(true);
			expect(result.excerpt.length).toBeLessThanOrEqual(40);
		});

		it('uses the leading excerpt when the match is already near the start', () => {
			expect(createMatchExcerpt(filler, 'word2', 40).excerpt).toBe(
				createMarkdownExcerpt(filler, 40)
			);
		});

		it('moves the window so a late match is visible', () => {
			const markdown = `${filler} the **lighthouse** keeper ${filler}`;
			const result = createMatchExcerpt(markdown, 'Lighthouse', 60);

			expect(result.truncated).toBe(true);
			expect(result.excerpt).toContain('lighthouse');
			expect(result.excerpt.startsWith('...')).toBe(true);
			expect(result.excerpt.endsWith('...')).toBe(true);
			expect(result.excerpt.length).toBeLessThanOrEqual(60);
		});

		it('drops the trailing ellipsis when the match is at the end', () => {
			const result = createMatchExcerpt(`${filler} final lighthouse`, 'lighthouse', 60);

			expect(result.excerpt.startsWith('...')).toBe(true);
			expect(result.excerpt.endsWith('final lighthouse')).toBe(true);
		});

		it('falls back to the leading excerpt when the query only matches markdown syntax', () => {
			const result = createMatchExcerpt(`${filler} **bold**`, '**bold**', 40);

			expect(result.excerpt).toBe(createMarkdownExcerpt(`${filler} **bold**`, 40));
		});
	});
});
