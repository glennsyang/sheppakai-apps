import type { ColumnDef } from '@tanstack/table-core';

import type { WindowCleaningCustomerWithStats } from '#lib';
import DataTableSortButton from '#lib/components/DataTableSortButton.svelte';
import { moneyCell } from '#lib/components/table/cells.js';
import { type Features, renderComponent } from '#lib/components/ui/data-table/index.js';
import { formatLocalTimestamp } from '#lib/utils/dates.js';

import DataTableActions from './data-table-actions.svelte';

function formatAddress(customer: WindowCleaningCustomerWithStats) {
	const unit = customer.unitNumber ? `, Unit ${customer.unitNumber}` : '';
	return `${customer.address}${unit}, ${customer.city}`;
}

export const columns: ColumnDef<Features, WindowCleaningCustomerWithStats>[] = [
	{
		accessorKey: 'name',
		header: ({ column }) =>
			renderComponent(DataTableSortButton, {
				columnName: 'Name',
				onclick: column.getToggleSortingHandler()
			}),
		meta: { mobile: 'title' }
	},
	{
		accessorKey: 'address',
		header: ({ column }) =>
			renderComponent(DataTableSortButton, {
				columnName: 'Address',
				onclick: column.getToggleSortingHandler()
			}),
		cell: ({ row }) => formatAddress(row.original),
		meta: { mobile: 'detail' }
	},
	{
		accessorKey: 'phoneNumber',
		header: 'Phone',
		cell: ({ row }) => row.original.phoneNumber || '—'
	},
	{
		id: 'lastJobDate',
		header: ({ column }) =>
			renderComponent(DataTableSortButton, {
				columnName: 'Last visit',
				onclick: column.getToggleSortingHandler()
			}),
		accessorFn: (row) => row.lastJobDate ?? '',
		cell: ({ row }) =>
			row.original.lastJobDate ? formatLocalTimestamp(row.original.lastJobDate) : 'Never',
		meta: { mobile: 'subvalue', width: 'w-32' }
	},
	{
		id: 'lastCharged',
		header: 'Last charged',
		cell: ({ row }) => {
			const latestJob = row.original.jobs[0];
			return latestJob ? moneyCell(latestJob.amountCharged, { currency: 'CAD', muted: true }) : '—';
		},
		meta: { align: 'end' }
	},
	{
		id: 'hourlyRate',
		header: ({ column }) =>
			renderComponent(DataTableSortButton, {
				columnName: '$/hour',
				onclick: column.getToggleSortingHandler()
			}),
		accessorFn: (row) => row.hourlyRate ?? -1,
		cell: ({ row }) =>
			row.original.hourlyRate == null
				? '—'
				: moneyCell(row.original.hourlyRate, { currency: 'CAD', muted: true }),
		meta: { align: 'end' }
	},
	{
		id: 'totalEarned',
		header: ({ column }) =>
			renderComponent(DataTableSortButton, {
				columnName: 'Total earned',
				onclick: column.getToggleSortingHandler()
			}),
		accessorFn: (row) => row.totalEarned,
		cell: ({ row }) => moneyCell(row.original.totalEarned, { currency: 'CAD' }),
		meta: { mobile: 'value', align: 'end' }
	},
	{
		id: 'actions',
		cell: ({ row }) =>
			renderComponent(DataTableActions, {
				customerData: row.original
			})
	}
];
