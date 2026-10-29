<script lang="ts">
	import { page } from '$app/state';

	import { Button } from '#lib/components/ui/button/index.js';

	let { children } = $props();

	const tabs = [
		{ href: '/admin', label: 'Users' },
		{ href: '/admin/api-keys', label: 'API keys' },
		{ href: '/admin/api-logs', label: 'API logs' }
	];
</script>

<div class="space-y-8 px-5 pt-8 pb-12 sm:px-10 sm:pt-12">
	<div class="space-y-4">
		<div>
			<h1 class="text-[2rem] leading-tight font-bold tracking-tight sm:text-[2.5rem]">Admin</h1>
			<p class="ink-soft mt-2 text-lg">Users, API access and the API write log.</p>
		</div>

		<nav aria-label="Admin sections">
			<ul class="flex flex-wrap gap-2">
				{#each tabs as tab (tab.href)}
					{@const active = page.url.pathname === tab.href}
					<li>
						<Button
							href={tab.href}
							size="sm"
							variant={active ? 'default' : 'outline'}
							aria-current={active ? 'page' : undefined}
						>
							{tab.label}
						</Button>
					</li>
				{/each}
			</ul>
		</nav>
	</div>

	{@render children()}
</div>
