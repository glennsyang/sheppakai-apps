<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { Ellipsis } from '@lucide/svelte/icons';

	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import type { SidebarNav } from '#lib/types.js';

	let { items }: { items: SidebarNav['navMain'] } = $props();

	// Admin lives in the account menu on phones; six tabs is the thumb limit, so the sections
	// marked `mobileMore` share the sixth slot behind More.
	const phoneItems = $derived(items.filter((i) => !i.adminOnly));
	const tabs = $derived(phoneItems.filter((i) => !i.mobileMore));
	const moreItems = $derived(phoneItems.filter((i) => i.mobileMore));

	const isActive = (url: string | undefined) => (url ? page.url.pathname.startsWith(url) : false);
	const activeMoreItem = $derived(moreItems.find((i) => isActive(i.url)));

	let moreOpen = $state(false);

	afterNavigate(() => {
		moreOpen = false;
	});
</script>

<nav
	aria-label="Sections"
	class="fixed inset-x-0 bottom-0 z-40 bg-cover pb-[env(safe-area-inset-bottom)] md:hidden"
>
	<ul class="grid grid-cols-6 gap-1 px-1.5">
		{#each tabs as item (item.title)}
			{@const active = isActive(item.url)}
			{@const Icon = item.icon}
			<li style="--pen: oklch(var(--color-{item.pen}))">
				<a
					href={item.url}
					aria-current={active ? 'page' : undefined}
					class={[
						'mobile-tab flex flex-col items-center gap-1 rounded-b-[3px] pt-2 pb-2.5 text-[0.65rem] leading-none font-bold',
						active && 'is-active'
					]}
				>
					{#if Icon}<Icon class="size-[1.15rem]" strokeWidth={2.25} aria-hidden="true" />{/if}
					<span class="max-w-full truncate">{item.short}</span>
				</a>
			</li>
		{/each}
		{#if moreItems.length > 0}
			<li style="--pen: oklch(var(--color-{activeMoreItem?.pen ?? 'teal'}))">
				<button
					type="button"
					aria-haspopup="dialog"
					aria-expanded={moreOpen}
					aria-current={activeMoreItem ? 'page' : undefined}
					onclick={() => (moreOpen = true)}
					class={[
						'mobile-tab flex w-full flex-col items-center gap-1 rounded-b-[3px] pt-2 pb-2.5 text-[0.65rem] leading-none font-bold',
						activeMoreItem && 'is-active'
					]}
				>
					<Ellipsis class="size-[1.15rem]" strokeWidth={2.25} aria-hidden="true" />
					<span class="max-w-full truncate">{activeMoreItem?.short ?? 'More'}</span>
				</button>
			</li>
		{/if}
	</ul>
</nav>

<Sheet.Root bind:open={moreOpen}>
	<Sheet.Content
		side="bottom"
		class="gap-0 rounded-t-[3px] pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
	>
		<Sheet.Header class="pb-2">
			<Sheet.Title>More</Sheet.Title>
			<Sheet.Description class="sr-only">The other sections of Synapse</Sheet.Description>
		</Sheet.Header>
		<ul class="grid gap-1 px-2">
			{#each moreItems as item (item.title)}
				{@const active = isActive(item.url)}
				{@const Icon = item.icon}
				<li style="--pen: oklch(var(--color-{item.pen}))">
					<a
						href={item.url}
						aria-current={active ? 'page' : undefined}
						class={[
							'more-link flex h-12 items-center gap-3 rounded-[3px] px-3 text-sm font-semibold',
							active && 'is-active'
						]}
					>
						{#if Icon}<Icon class="size-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />{/if}
						<span class="min-w-0 flex-1">
							<span class="block truncate">{item.title}</span>
							<span class="text-muted-foreground block truncate text-xs font-normal">
								{item.description}
							</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</Sheet.Content>
</Sheet.Root>

<style>
	.mobile-tab {
		color: var(--cover-foreground);
		border-top: 3px solid var(--pen);
		transition:
			background-color 160ms ease-out,
			color 160ms ease-out;
	}
	/* Active tab hangs from the sheet above it, in the sheet's own paper. */
	.mobile-tab.is-active {
		background: var(--paper);
		color: var(--pen);
		border-top-color: var(--paper);
	}
	.more-link {
		border-left: 3px solid var(--pen);
	}
	.more-link :global(svg) {
		color: var(--pen);
	}
	.more-link.is-active {
		background: color-mix(in oklch, var(--pen) 10%, transparent);
	}
</style>
