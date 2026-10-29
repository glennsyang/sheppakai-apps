<script lang="ts">
	import { superForm } from 'sveltekit-superforms';

	import { API_SCOPES, type ApiScope } from '#lib/api-scopes.js';
	import { apiKeyColumns } from '#lib/components/admin/api-keys-columns.js';
	import { Alert } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import DataTable from '#lib/components/ui/data-table/DataTable.svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	import type { ActionData, PageData } from './$types';

	let { data, form: actionForm }: { data: PageData; form: ActionData } = $props();

	let revealedKey = $state<string | null>(null);
	let copied = $state(false);

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const { form, errors, enhance, message, submitting } = superForm(data.createForm, {
		dataType: 'json',
		resetForm: true,
		onUpdate: ({ result }) => {
			const resultData = result.data as { apiKey?: string } | undefined;
			revealedKey = resultData?.apiKey ?? null;
			copied = false;
		}
	});

	// Revoke answers with `message(form, …)` on a form of its own; the create form renders its
	// own message, so skip it here.
	const revokeMessage = $derived.by(() => {
		const submitted = (
			actionForm as { form?: { id: string; message?: App.Superforms.Message } } | null
		)?.form;
		return submitted && submitted.id !== data.createForm.id ? submitted.message : undefined;
	});

	function toggleScope(scope: ApiScope, checked: boolean) {
		$form.scopes = checked
			? [...new Set([...$form.scopes, scope])]
			: $form.scopes.filter((s) => s !== scope);
	}

	async function copyKey() {
		if (!revealedKey) return;
		await navigator.clipboard.writeText(revealedKey);
		copied = true;
	}
</script>

<svelte:head>
	<title>API keys — Meal Planner</title>
</svelte:head>

<div class="space-y-8">
	{#if revealedKey}
		<Alert variant="warning" role="status" class="space-y-3">
			<p class="font-semibold">Copy your new key now. It will not be shown again.</p>
			<div class="flex flex-col gap-2 sm:flex-row">
				<Input readonly value={revealedKey} class="font-mono text-sm" aria-label="New API key" />
				<div class="flex gap-2">
					<Button type="button" size="sm" onclick={copyKey}>{copied ? 'Copied' : 'Copy'}</Button>
					<Button type="button" size="sm" variant="outline" onclick={() => (revealedKey = null)}>
						Done
					</Button>
				</div>
			</div>
		</Alert>
	{:else if $message}
		<Alert variant={$message.type === 'error' ? 'destructive' : 'success'} role="status">
			{$message.text}
		</Alert>
	{/if}

	{#if revokeMessage}
		<Alert variant={revokeMessage.type === 'error' ? 'destructive' : 'success'} role="status">
			{revokeMessage.text}
		</Alert>
	{/if}

	<section class="space-y-4">
		<div>
			<h2 class="text-xl font-bold tracking-tight">New API key</h2>
			<p class="ink-soft text-sm">
				For outside tools like an assistant or a script. Give each key only the scopes it needs. See <code
					>apps/mealplanner/docs/API.md</code
				> for the endpoints.
			</p>
		</div>

		<form method="POST" action="?/createApiKey" use:enhance class="max-w-2xl space-y-5">
			<Label>
				<span class="block text-xs font-medium">Name</span>
				<Input
					name="name"
					autocomplete="off"
					placeholder="e.g. Household assistant"
					bind:value={$form.name}
					aria-invalid={$errors.name ? 'true' : undefined}
				/>
				{#if $errors.name}<span class="ink-red text-xs">{$errors.name}</span>{/if}
			</Label>

			<fieldset class="space-y-2">
				<legend class="text-xs font-medium">Scopes</legend>
				<div class="grid gap-x-4 gap-y-1 sm:grid-cols-2">
					{#each API_SCOPES as scope (scope)}
						<label class="flex min-h-10 items-center gap-2.5 font-mono text-sm">
							<input
								type="checkbox"
								class="size-4"
								checked={$form.scopes.includes(scope)}
								onchange={(e) => toggleScope(scope, e.currentTarget.checked)}
							/>
							{scope}
						</label>
					{/each}
				</div>
				{#if $errors.scopes?._errors}
					<span class="ink-red text-xs">{$errors.scopes._errors.join(', ')}</span>
				{/if}
			</fieldset>

			<Label>
				<span class="block text-xs font-medium">Expires after (days)</span>
				<Input
					name="expiresInDays"
					type="number"
					inputmode="numeric"
					min="1"
					max="365"
					placeholder="Never"
					class="max-w-40"
					bind:value={$form.expiresInDays}
				/>
				<span class="ink-soft block text-xs">Leave empty for a key that never expires.</span>
			</Label>

			<Button type="submit" disabled={$submitting}>
				{$submitting ? 'Creating…' : 'Create key'}
			</Button>
		</form>
	</section>

	<section class="space-y-4">
		<h2 class="text-xl font-bold tracking-tight">Keys</h2>
		{#if data.loadError}
			<Alert variant="destructive" role="alert">{data.loadError}</Alert>
		{:else}
			<DataTable
				columns={apiKeyColumns}
				data={data.apiKeys}
				searchPlaceholder="Search keys..."
				emptyMessage="No API keys yet."
			/>
		{/if}
	</section>
</div>
