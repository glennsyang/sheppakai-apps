<script lang="ts">
	import { cn } from "#lib/utils.js";
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { SVGAttributes } from "svelte/elements";

	let {
		class: className,
		role = "status",
		// we add name, color, and stroke for compatibility with different icon libraries props
		name,
		color,
		stroke,
		"aria-label": ariaLabel = "Loading",
		...restProps
	}: SVGAttributes<SVGSVGElement> = $props();

	// Forward only props that are set: @lucide/svelte >=1.61 lets an explicit
	// `stroke={undefined}` override its currentColor default, hiding the icon.
	const iconProps = $derived({
		...(name == null ? {} : { name }),
		...(color == null ? {} : { color }),
		...(stroke == null ? {} : { stroke })
	});
</script>

<Loader2Icon {role} {...iconProps} aria-label={ariaLabel} class={cn("size-4 animate-spin", className)} {...restProps} />
