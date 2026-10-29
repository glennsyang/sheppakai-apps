import type { AdminApiLogEntry } from '@sheppakai/shared/api-audit-log';
import type { ColumnDef } from '@tanstack/table-core';

import { type Features, renderComponent } from '#lib/components/ui/data-table/index.js';

import ApiStatusBadge from './ApiStatusBadge.svelte';
import DataTableSortButton from './DataTableSortButton.svelte';

const timestamp = (createdAt: Date) =>
	createdAt.toLocaleString('en-CA', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

export const apiLogColumns: ColumnDef<Features, AdminApiLogEntry>[] = [
	{
		accessorKey: 'createdAt',
		header: ({ column }) =>
			renderComponent(DataTableSortButton, {
				columnName: 'When',
				onclick: column.getToggleSortingHandler()
			}),
		cell: ({ row }) => timestamp(new Date(row.original.createdAt))
	},
	{
		accessorKey: 'action',
		header: 'Action'
	},
	{
		id: 'request',
		header: 'Request',
		accessorFn: (row) => `${row.method} ${row.path}`
	},
	{
		id: 'user',
		header: 'User',
		accessorFn: (row) => row.user.name || row.user.email
	},
	{
		id: 'apiKey',
		header: 'API key',
		accessorFn: (row) =>
			row.apiKeyExists ? row.apiKeyName || '(unnamed)' : `${row.apiKeyId} (revoked)`
	},
	{
		accessorKey: 'statusCode',
		header: 'Status',
		cell: ({ row }) =>
			renderComponent(ApiStatusBadge, {
				label: String(row.original.statusCode),
				ok: row.original.statusCode < 400
			})
	}
];
