// shadcn-svelte's generated components import `cn` and its prop types from `#lib/utils.js`.
export {
	cn,
	type WithElementRef,
	type WithoutChild,
	type WithoutChildren,
	type WithoutChildrenOrChild
} from '@sheppakai/shared/cn';

// Month selection
export const months = [
	{ value: '01', label: 'January' },
	{ value: '02', label: 'February' },
	{ value: '03', label: 'March' },
	{ value: '04', label: 'April' },
	{ value: '05', label: 'May' },
	{ value: '06', label: 'June' },
	{ value: '07', label: 'July' },
	{ value: '08', label: 'August' },
	{ value: '09', label: 'September' },
	{ value: '10', label: 'October' },
	{ value: '11', label: 'November' },
	{ value: '12', label: 'December' }
];

export const monthNames = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/**
 * Formats a number as USD currency.
 * @param amount - The amount to format
 * @returns The formatted currency string
 */
export function formatCurrency(amount: number): string {
	const formatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	});
	return formatter.format(amount);
}

export function abbreviateCategoryName(name: string, maxLength = 6): string {
	if (name.length <= maxLength) return name;

	const firstSep = name.search(/[ /]/);
	const base = firstSep > 0 ? name.slice(0, firstSep) : name;

	if (base.length <= maxLength) return base;

	return base.slice(0, maxLength - 1) + '.';
}

export function formatCurrencyRounded(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	}).format(Math.round(amount));
}

// Better Auth error code -> message map, shared by every app.
export { getBetterAuthErrorMessage } from '@sheppakai/shared/better-auth-errors';
