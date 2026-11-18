import MarkdownIt from 'markdown-it';

const markdownRenderer = new MarkdownIt({
	html: false,
	linkify: true,
	typographer: false,
	breaks: true
});

function decodeHtmlEntities(value: string): string {
	return value
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'");
}

/**
 * Render markdown to HTML while disallowing raw HTML tags in user input.
 */
export function renderMarkdownToSafeHtml(markdown: string | null | undefined): string {
	if (!markdown?.trim()) {
		return '';
	}

	return markdownRenderer.render(markdown);
}

/**
 * Convert markdown to plain text for compact previews.
 */
export function markdownToPlainText(markdown: string | null | undefined): string {
	if (!markdown?.trim()) {
		return '';
	}

	const html = renderMarkdownToSafeHtml(markdown);
	const text = html
		.replaceAll(/<[^>]*>/g, ' ')
		.replaceAll(/\s+/g, ' ')
		.replaceAll(/\s+([.,!?;:])/g, '$1')
		.trim();

	return decodeHtmlEntities(text);
}

function clipAtWordBoundary(text: string, maxLength: number): string {
	const clipped = text.slice(0, Math.max(0, maxLength)).trimEnd();
	const boundary = clipped.lastIndexOf(' ');
	return boundary > 0 ? clipped.slice(0, boundary).trimEnd() : clipped;
}

export function createMarkdownExcerpt(
	markdown: string | null | undefined,
	maxLength = 140
): string {
	const plainText = markdownToPlainText(markdown);

	if (plainText.length <= maxLength) {
		return plainText;
	}

	return `${clipAtWordBoundary(plainText, maxLength - 3)}...`;
}

/**
 * Plain-text excerpt for a list preview. When `query` is found past the
 * start of the text, the window is moved so the match is visible, with
 * `...` marking text cut from either end.
 */
export function createMatchExcerpt(
	markdown: string | null | undefined,
	query: string | null | undefined,
	maxLength = 140
): { excerpt: string; truncated: boolean } {
	const plainText = markdownToPlainText(markdown);

	if (plainText.length <= maxLength) {
		return { excerpt: plainText, truncated: false };
	}

	const needle = query?.trim().toLowerCase() ?? '';
	const matchIndex = needle ? plainText.toLowerCase().indexOf(needle) : -1;

	// No match, or the match already fits in the leading excerpt.
	if (matchIndex < 0 || matchIndex + needle.length <= maxLength - 3) {
		return { excerpt: createMarkdownExcerpt(markdown, maxLength), truncated: true };
	}

	const budget = maxLength - 6; // room for leading and trailing "..."
	const lead = Math.max(0, Math.floor((budget - needle.length) / 2));
	let start = Math.max(0, matchIndex - lead);
	const end = Math.min(plainText.length, start + budget);
	start = Math.max(0, end - budget);

	// Snap the start forward to a word boundary, without skipping the match.
	if (start > 0) {
		const nextSpace = plainText.indexOf(' ', start);
		if (nextSpace >= 0 && nextSpace < matchIndex) {
			start = nextSpace + 1;
		}
	}

	let body = plainText.slice(start, end);
	if (end < plainText.length && plainText[end] !== ' ') {
		const clipped = clipAtWordBoundary(body, body.length);
		// Keep the match whole even if that means cutting mid-word.
		body = clipped.length >= matchIndex - start + needle.length ? clipped : body.trimEnd();
	}

	const prefix = start > 0 ? '...' : '';
	const suffix = end < plainText.length ? '...' : '';
	return { excerpt: `${prefix}${body.trim()}${suffix}`, truncated: true };
}
