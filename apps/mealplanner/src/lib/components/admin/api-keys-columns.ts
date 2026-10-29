import type { ApiKeyWithOwner } from '@sheppakai/shared/api-key-admin';
import type { ColumnDef } from '@tanstack/table-core';

import { type Features, renderComponent } from '#lib/components/ui/data-table/index.js';

import ApiKeyActions from './ApiKeyActions.svelte';
import ApiStatusBadge from './ApiStatusBadge.svelte';

function scopesFromPermissions(permissions: Record<string, string[]> | null): string {
	if (!permissions) return '';
	return Object.entries(permissions)
		.flatMap(([resource, actions]) => actions.map((action) => `${resource}:${action}`))
		.join(', ');
}

const shortDate = (value: Date | string | null) =>
	value
		? new Date(value).toLocaleDateString('en-CA', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			})
		: 'Never';

export const apiKeyColumns: ColumnDef<Features, ApiKeyWithOwner>[] = [
	{
		accessorKey: 'name',
		header: 'Key',
		cell: ({ row }) =>
			`${row.original.name || '(unnamed)'}${row.original.start ? ` · ${row.original.start}…` : ''}`
	},
	{
		accessorKey: 'ownerEmail',
		header: 'Owner'
	},
	{
		id: 'scopes',
		header: 'Scopes',
		accessorFn: (row) => scopesFromPermissions(row.permissions)
	},
	{
		accessorKey: 'enabled',
		header: 'Status',
		accessorFn: (row) => (row.enabled ? 'Active' : 'Disabled'),
		cell: ({ row }) =>
			renderComponent(ApiStatusBadge, {
				label: row.original.enabled ? 'active' : 'disabled',
				ok: row.original.enabled
			})
	},
	{
		accessorKey: 'expiresAt',
		header: 'Expires',
		cell: ({ row }) => shortDate(row.original.expiresAt)
	},
	{
		accessorKey: 'lastRequest',
		header: 'Last used',
		cell: ({ row }) => shortDate(row.original.lastRequest)
	},
	{
		id: 'actions',
		header: 'Actions',
		enableSorting: false,
		cell: ({ row }) =>
			renderComponent(ApiKeyActions, {
				id: row.original.id,
				name: row.original.name || '(unnamed)'
			})
	}
];
