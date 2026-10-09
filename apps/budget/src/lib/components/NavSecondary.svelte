<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { Component } from 'svelte';

	let {
		title,
		items,
		isAdmin = false,
		activeUrl = null
	}: {
		activeUrl?: string | null;
		title: string;
		items: { title: string; url: string; icon?: Component; adminOnly?: boolean }[];
		isAdmin?: boolean;
	} = $props();

	const visibleItems = $derived(items.filter((item) => !item.adminOnly || isAdmin));
</script>

<Sidebar.Group class="group-data-[collapsible=icon]:hidden">
	<Sidebar.GroupLabel>{title}</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each visibleItems as item (item.title)}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={item.title} isActive={item.url === activeUrl}>
					{#snippet child({ props })}
						{@const IconComponent = item.icon}
						<a href={item.url} data-sveltekit-preload-data="hover" {...props}>
							<IconComponent />
							<span>{item.title}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
