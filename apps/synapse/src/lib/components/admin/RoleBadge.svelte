<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';

	let { role }: { role: string } = $props();
</script>

<Badge variant={role === 'admin' ? 'destructive' : 'outline'}>{role}</Badge>
