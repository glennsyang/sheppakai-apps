<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';

	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import type { SidebarNav } from '#lib/types.js';

	let { items }: { items: SidebarNav['navMain'] } = $props();

	// Admin lives in the account menu on phones.
	const visible = $derived(items.filter((i) => !i.adminOnly));
	const tabs = $derived(visible.filter((i) => !i.mobileOverflow));
	const overflow = $derived(visible.filter((i) => i.mobileOverflow));

	const isActive = (url?: string) => (url ? page.url.pathname.startsWith(url) : false);
	const activeOverflow = $derived(overflow.find((i) => isActive(i.url)));
	const columns = $derived(tabs.length + (overflow.length > 0 ? 1 : 0));
</script>

<nav
	aria-label="Sections"
	class="fixed inset-x-0 bottom-0 z-40 bg-cover pb-[env(safe-area-inset-bottom)] md:hidden"
>
	<ul class="grid gap-1 px-1.5" style="grid-template-columns: repeat({columns}, minmax(0, 1fr))">
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
		{#if overflow.length > 0}
			<!-- The "More" tab takes the pen of whichever tucked-away section is open. -->
			<li
				style="--pen: oklch(var(--color-{activeOverflow?.pen ?? 'teal'}))"
				class={!activeOverflow ? 'more-idle' : undefined}
			>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								aria-label="More sections"
								class={[
									'mobile-tab flex w-full flex-col items-center gap-1 rounded-b-[3px] pt-2 pb-2.5 text-[0.65rem] leading-none font-bold',
									activeOverflow && 'is-active'
								]}
							>
								<Ellipsis class="size-[1.15rem]" strokeWidth={2.25} aria-hidden="true" />
								<span class="max-w-full truncate">{activeOverflow?.short ?? 'More'}</span>
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="top" align="end" sideOffset={8} class="w-44">
						{#each overflow as item (item.title)}
							{@const Icon = item.icon}
							<DropdownMenu.Item
								onclick={() => item.url && goto(item.url)}
								aria-current={isActive(item.url) ? 'page' : undefined}
								class="min-h-11"
								style="--pen: oklch(var(--color-{item.pen}))"
							>
								{#if Icon}<Icon class="size-4 text-(--pen)" aria-hidden="true" />{/if}
								<span>{item.title}</span>
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</li>
		{/if}
	</ul>
</nav>

<style>
	.mobile-tab {
		color: var(--cover-foreground);
		border-top: 3px solid var(--pen);
		transition:
			background-color 160ms ease-out,
			color 160ms ease-out;
	}
	/* No tucked-away section open: the More tab gets a neutral rule, not a section's pen. */
	.more-idle .mobile-tab {
		border-top-color: color-mix(in oklch, var(--cover-foreground) 35%, transparent);
	}
	/* Active tab hangs from the sheet above it, in the sheet's own paper. */
	.mobile-tab.is-active {
		background: var(--paper);
		color: var(--pen);
		border-top-color: var(--paper);
	}
</style>
