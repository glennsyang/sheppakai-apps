<script lang="ts">
	import { enhance } from '$app/forms';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';

	import { actionFailureText } from '#lib/action-result.js';
	import AuthFormMessage from '#lib/components/AuthFormMessage.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { Alert } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { addWeeks, getMondayOf } from '#lib/dates.js';
	import { addShoppingItemSchema } from '#lib/schemas/shopping.js';
	import { AISLES, formatAmount } from '#lib/shopping.js';
	import type { ShoppingListItem } from '#lib/types.js';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally — superForm is intentionally initialized once from props
	const {
		form,
		errors,
		message,
		enhance: addEnhance,
		submitting
	} = superForm(data.addForm, {
		validators: zod4Client(addShoppingItemSchema),
		resetForm: true
	});

	// Ticks shown before the server answers, so the checkbox feels instant in the store.
	let pending = $state<Record<string, boolean>>({});
	let actionError = $state<string | null>(null);

	const isChecked = (item: ShoppingListItem) => pending[item.id] ?? item.checked;

	const groups = $derived(
		[...AISLES, ...new Set(data.items.map((i) => i.aisle))]
			.filter((aisle, index, all) => all.indexOf(aisle) === index)
			.map((aisle) => ({
				aisle,
				items: data.items
					.filter((i) => i.aisle === aisle)
					.toSorted((a, b) => Number(isChecked(a)) - Number(isChecked(b)))
			}))
			.filter((group) => group.items.length > 0)
	);
	const remaining = $derived(data.items.filter((i) => !isChecked(i)).length);
	const isCurrentWeek = $derived(data.weekStartDate === getMondayOf(new Date()));

	// Keep the add form on the week being shown after week navigation.
	$effect(() => {
		$form.weekStartDate = data.weekStartDate;
	});

	function weekLabel(weekStartDate: string): string {
		const monday = new Date(weekStartDate + 'T00:00:00');
		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);
		const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		return `${fmt(monday)} – ${fmt(sunday)}`;
	}
</script>

<svelte:head>
	<title>Shopping List — Meal Planner</title>
</svelte:head>

<div class="px-5 pt-8 pb-4 sm:px-10 sm:pt-12">
	<div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
		<div>
			<h1 class="text-[2rem] leading-tight font-bold tracking-tight sm:text-[2.5rem]">
				Shopping list
			</h1>
			<p class="ink-soft mt-1 text-lg">What the week's dinners need, minus what's in the pantry.</p>
		</div>

		<nav class="flex items-center gap-1" aria-label="Choose week">
			<a
				href="?week={addWeeks(data.weekStartDate, -1)}"
				class="week-step"
				aria-label="Previous week"
			>
				<Icon name="left" size={20} />
			</a>
			<span class="marker tabular min-w-[9.5rem] text-center text-lg" aria-live="polite">
				{weekLabel(data.weekStartDate)}
			</span>
			<a href="?week={addWeeks(data.weekStartDate, 1)}" class="week-step" aria-label="Next week">
				<Icon name="right" size={20} />
			</a>
		</nav>
	</div>
	{#if !isCurrentWeek}
		<a href="/shopping" class="act-text ink-blue mt-3 inline-block">Back to this week</a>
	{/if}

	{#if data.loadError}
		<Alert variant="destructive" class="mt-6" role="alert">{data.loadError}</Alert>
	{/if}
	{#if actionError}
		<Alert variant="destructive" class="mt-6" role="alert">{actionError}</Alert>
	{/if}
</div>

<section class="px-5 pb-8 sm:px-10" aria-labelledby="list-heading">
	<h2 id="list-heading" class="mb-4 flex items-baseline gap-3">
		<span class="text-xl font-bold tracking-tight">To buy</span>
		<span class="marker ink-blue tabular text-lg">{remaining}</span>
	</h2>

	{#if data.items.length === 0}
		<p class="marker ink-faint text-xl">Nothing to buy.</p>
		<p class="ink-soft mt-2">
			Plan some dinners on <a href="/planner?week={data.weekStartDate}" class="act-text ink-blue"
				>the week</a
			>, or add an item below.
		</p>
	{:else}
		<div class="space-y-6">
			{#each groups as group (group.aisle)}
				<div>
					<h3 class="ink-soft mb-1 text-sm font-semibold tracking-wide uppercase">
						{group.aisle}
					</h3>
					<ul class="ruled">
						{#each group.items as item (item.id)}
							{@const checked = isChecked(item)}
							<li class={['row', { done: checked }]}>
								<form
									method="POST"
									action="?/toggle"
									class="min-w-0 flex-1"
									use:enhance={() => {
										pending[item.id] = !checked;
										return async ({ result, update }) => {
											if (result.type === 'success') {
												actionError = null;
											} else {
												actionError = actionFailureText(
													result,
													`Could not update ${item.name}. Please try again.`
												);
											}
											await update({ reset: false });
											delete pending[item.id];
										};
									}}
								>
									<input type="hidden" name="id" value={item.id} />
									<input type="hidden" name="checked" value={String(!checked)} />
									<button
										type="submit"
										class="tick"
										role="checkbox"
										aria-checked={checked}
										aria-label="{item.name}{checked ? ', bought' : ''}"
									>
										<span class="box" aria-hidden="true">
											{#if checked}<Icon name="check" size={18} />{/if}
										</span>
										<span class="name min-w-0 flex-1 truncate text-lg font-semibold">
											{item.name}
										</span>
										<span class="ink-soft tabular shrink-0">
											{formatAmount(item.quantity, item.unit)}
										</span>
									</button>
								</form>
								{#if item.manual}
									<form
										method="POST"
										action="?/removeItem"
										use:enhance={() =>
											async ({ result, update }) => {
												actionError =
													result.type === 'success'
														? null
														: actionFailureText(result, `Could not remove ${item.name}.`);
												await update({ reset: false });
											}}
									>
										<input type="hidden" name="id" value={item.id} />
										<button type="submit" class="take-off" aria-label="Remove {item.name}">
											<Icon name="x" size={16} />
										</button>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
		<p class="ink-faint mt-6 text-sm">Ticking an item adds it to the pantry.</p>
	{/if}
</section>

<section class="add-section px-5 pt-7 pb-10 sm:px-10" aria-labelledby="add-heading">
	<h2 id="add-heading" class="mb-4 text-xl font-bold tracking-tight">Add an item</h2>
	<form method="POST" action="?/addItem" use:addEnhance>
		<AuthFormMessage message={$message} />
		<input type="hidden" name="weekStartDate" value={$form.weekStartDate} />
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto] sm:items-end">
			<Label class="col-span-2 sm:col-span-1">
				<span class="font-semibold">Item</span>
				<Input
					type="text"
					name="name"
					bind:value={$form.name}
					class="text-lg"
					required
					maxlength={100}
					aria-invalid={$errors.name ? 'true' : undefined}
					placeholder="Paper towels"
				/>
			</Label>
			<Label>
				<span class="font-semibold">Amount</span>
				<Input
					type="number"
					name="quantity"
					bind:value={$form.quantity}
					class="tabular text-lg"
					min={0}
					step="any"
					placeholder="1"
				/>
			</Label>
			<Label>
				<span class="font-semibold">Unit</span>
				<Input type="text" name="unit" bind:value={$form.unit} class="text-lg" placeholder="pack" />
			</Label>
			<Button type="submit" disabled={$submitting} class="col-span-2 py-3 sm:col-span-1">
				<Icon name="plus" />
				{$submitting ? 'Adding…' : 'Add'}
			</Button>
		</div>
		{#if $errors.name}
			<p class="ink-red mt-2 text-sm">{$errors.name}</p>
		{/if}
	</form>
</section>

<style>
	.week-step {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 999px;
		color: var(--ink-soft);
		box-shadow: inset 0 0 0 1.5px var(--rule);
	}
	.week-step:hover {
		color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--ink);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		border-bottom: 1px solid var(--rule);
	}
	.tick {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		width: 100%;
		min-height: 3.25rem;
		padding: 0.5rem 0.25rem;
		text-align: left;
	}
	.box {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 4px;
		box-shadow: inset 0 0 0 1.5px var(--ink-soft);
		color: var(--marker-green);
	}
	.done .box {
		box-shadow: inset 0 0 0 1.5px var(--marker-green);
	}
	.done .name {
		color: var(--ink-faint);
		text-decoration: line-through;
	}
	.add-section {
		border-top: 1px solid var(--rule-strong);
	}
	.take-off {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 2px;
		color: var(--ink-faint);
	}
	.take-off:hover {
		color: var(--marker-red);
		background: color-mix(in oklch, var(--marker-red) 10%, transparent);
	}
</style>
