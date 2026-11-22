import type { ColumnDef } from '@tanstack/table-core';

import type { RecurringBill } from '#lib';
import DataTableSortButton from '#lib/components/DataTableSortButton.svelte';
import { moneyCell } from '#lib/components/table/cells.js';
import { type Features, renderComponent } from '#lib/components/ui/data-table/index.js';

import DataTableActions from './data-table-actions.svelte';
import PaidToggle from './paid-toggle.svelte';
import PastAmountEdit from './past-amount-edit.svelte';

const MONTH_ABBREVIATIONS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

function formatDueDate(bill: RecurringBill): string {
	if (!bill.dueDay) return '';
	if (bill.cadence === 'Yearly' && bill.dueMonth) {
		return `Due ${MONTH_ABBREVIATIONS[bill.dueMonth - 1]} ${bill.dueDay}`;
	}
	return `Due the ${bill.dueDay}${ordinalSuffix(bill.dueDay)}`;
}

function ordinalSuffix(day: number): string {
	if (day % 10 === 1 && day !== 11) return 'st';
	if (day % 10 === 2 && day !== 12) return 'nd';
	if (day % 10 === 3 && day !== 13) return 'rd';
	return 'th';
}

export type ColumnMode =
	| { kind: 'current' }
	| { kind: 'past'; monthKey: string; periodLabel: string }
	| { kind: 'future' };

/**
 * Columns for the recurring table. Only the current month toggles paid state and edits or
 * deletes bills. A past month offers a one-month amount correction; a future month is view-only.
 */
export function getColumns(mode: ColumnMode): ColumnDef<Features, RecurringBill>[] {
	const editable = mode.kind === 'current';
	const columns: ColumnDef<Features, RecurringBill>[] = [
		{
			id: 'paid',
			header: 'Paid',
			enableHiding: false,
			cell: ({ row }) =>
				renderComponent(PaidToggle, { recurringBill: row.original, readonly: !editable }),
			meta: { mobile: 'lead', width: 'w-14' }
		},
		{
			accessorKey: 'merchant',
			header: ({ column }) =>
				renderComponent(DataTableSortButton, {
					columnName: 'Payee',
					onclick: column.getToggleSortingHandler()
				}),
			meta: { mobile: 'title' }
		},
		{
			accessorKey: 'description',
			header: ({ column }) =>
				renderComponent(DataTableSortButton, {
					columnName: 'Description',
					onclick: column.getToggleSortingHandler()
				}),
			meta: { mobile: 'detail' }
		},
		{
			accessorKey: 'cadence',
			header: 'Cadence',
			meta: { mobile: 'detail' }
		},
		{
			id: 'dueDate',
			header: 'Due',
			accessorFn: (row) => formatDueDate(row),
			cell: ({ row }) => formatDueDate(row.original) || '—',
			meta: { mobile: 'detail' }
		},
		{
			accessorKey: 'amount',
			header: ({ column }) =>
				renderComponent(DataTableSortButton, {
					columnName: 'Amount',
					onclick: column.getToggleSortingHandler()
				}),
			cell: ({ row }) => moneyCell(Number(row.original.amount), { muted: row.original.paid }),
			meta: { mobile: 'value', align: 'end' }
		}
	];

	if (mode.kind === 'past') {
		columns.push({
			id: 'actions',
			cell: ({ row }) =>
				renderComponent(PastAmountEdit, {
					recurringBill: row.original,
					monthKey: mode.monthKey,
					periodLabel: mode.periodLabel
				})
		});
	} else if (editable) {
		columns.push({
			id: 'actions',
			cell: ({ row }) =>
				renderComponent(DataTableActions, {
					id: row.original.id,
					recurringBill: row.original
				})
		});
	}

	return columns;
}
