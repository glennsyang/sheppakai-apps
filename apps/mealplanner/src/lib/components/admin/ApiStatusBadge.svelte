<script lang="ts">
	let { label, ok }: { label: string; ok: boolean } = $props();
</script>

<span class="marker {ok ? 'ink-green' : 'ink-red'}">{label}</span>
