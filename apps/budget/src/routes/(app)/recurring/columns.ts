import type { ColumnDef } from '@tanstack/table-core';

import type { Recurring } from '#lib';
import DataTableSortButton from '#lib/components/DataTableSortButton.svelte';
import { moneyCell } from '#lib/components/table/cells.js';
import { type Features, renderComponent } from '#lib/components/ui/data-table/index.js';

import DataTableActions from './data-table-actions.svelte';
import PaidToggle from './paid-toggle.svelte';

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

function formatDueDate(recurring: Recurring): string {
	if (!recurring.dueDay) return '';
	if (recurring.cadence === 'Yearly' && recurring.dueMonth) {
		return `Due ${MONTH_ABBREVIATIONS[recurring.dueMonth - 1]} ${recurring.dueDay}`;
	}
	return `Due the ${recurring.dueDay}${ordinalSuffix(recurring.dueDay)}`;
}

function ordinalSuffix(day: number): string {
	if (day % 10 === 1 && day !== 11) return 'st';
	if (day % 10 === 2 && day !== 12) return 'nd';
	if (day % 10 === 3 && day !== 13) return 'rd';
	return 'th';
}

/**
 * Columns for the recurring table. `editable` is false for months other than the current one:
 * paid state shows but can't be toggled, and the edit/delete actions are dropped.
 */
export function getColumns(editable: boolean): ColumnDef<Features, Recurring>[] {
	const columns: ColumnDef<Features, Recurring>[] = [
		{
			id: 'paid',
			header: 'Paid',
			enableHiding: false,
			cell: ({ row }) =>
				renderComponent(PaidToggle, { recurring: row.original, readonly: !editable }),
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

	if (editable) {
		columns.push({
			id: 'actions',
			cell: ({ row }) =>
				renderComponent(DataTableActions, {
					id: row.original.id,
					recurringData: row.original
				})
		});
	}

	return columns;
}
