<script lang="ts">
	import { enhance as enhanceAction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import {
		CircleAlert,
		CircleCheck,
		Gauge,
		KeyRound,
		Lock,
		Pencil,
		Plus,
		Save,
		Sunrise,
		SlidersHorizontal,
		User,
		X
	} from '@lucide/svelte';
	import { actionMessage } from '@sheppakai/shared/action-message';
	import { isPasskeySupported, passkeyErrorMessage } from '@sheppakai/shared/passkey-client';
	import { superForm } from 'sveltekit-superforms';

	import LoadErrorAlert from '#lib/components/shared/LoadErrorAlert.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Separator from '#lib/components/ui/separator/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { authClient } from '#lib/passkey-client.js';
	import { PASSKEY_NAME_MAX } from '#lib/schemas/passkeys.js';
	import { formatTimestampShort } from '#lib/utils/date.js';
	import {
		convertVisitThresholdFromDays,
		convertVisitThresholdToDays
	} from '#lib/utils/visit-status.js';

	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type FormMessage =
		| string
		| {
				type?: string;
				text?: string;
		  }
		| null
		| undefined;

	function getMessageText(message: FormMessage): string {
		if (typeof message === 'string') {
			return message;
		}

		if (message && typeof message.text === 'string') {
			return message.text;
		}

		return '';
	}

	function isSuccessMessage(message: FormMessage): boolean {
		return typeof message === 'object' && message?.type === 'success';
	}

	// Profile form
	// svelte-ignore state_referenced_locally
	const profileFormStore = superForm(data.profileForm, {
		onUpdate: ({ form }) => {
			if (isSuccessMessage(form.message as FormMessage)) {
				isEditingProfile = false;
			}
		}
	});

	const {
		form: profileForm,
		errors: profileErrors,
		message: profileMessage,
		submitting: profileSubmitting,
		enhance: profileEnhance
	} = profileFormStore;

	// Password form
	// svelte-ignore state_referenced_locally
	const passwordFormStore = superForm(data.passwordForm, {
		resetForm: true,
		onUpdate: ({ form }) => {
			if (isSuccessMessage(form.message as FormMessage)) {
				isEditingPassword = false;
			}
		}
	});

	const {
		form: passwordForm,
		errors: passwordErrors,
		message: passwordMessage,
		submitting: passwordSubmitting,
		enhance: passwordEnhance
	} = passwordFormStore;

	// Visit settings form
	// svelte-ignore state_referenced_locally
	const visitSettingsFormStore = superForm(data.visitSettingsForm, {
		onUpdate: ({ form }) => {
			if (isSuccessMessage(form.message as FormMessage)) {
				isEditingVisitSettings = false;
			}
		}
	});

	const {
		form: visitSettingsForm,
		errors: visitSettingsErrors,
		message: visitSettingsMessage,
		submitting: visitSettingsSubmitting,
		enhance: visitSettingsEnhance
	} = visitSettingsFormStore;

	// Dashboard goal settings form
	// svelte-ignore state_referenced_locally
	const dashboardGoalSettingsFormStore = superForm(data.dashboardGoalSettingsForm, {
		onUpdate: ({ form }) => {
			if (isSuccessMessage(form.message as FormMessage)) {
				isEditingDashboardGoals = false;
			}
		}
	});

	const {
		form: dashboardGoalSettingsForm,
		errors: dashboardGoalSettingsErrors,
		message: dashboardGoalSettingsMessage,
		submitting: dashboardGoalSettingsSubmitting,
		enhance: dashboardGoalSettingsEnhance
	} = dashboardGoalSettingsFormStore;

	// Morning digest settings form
	// svelte-ignore state_referenced_locally
	const morningDigestFormStore = superForm(data.morningDigestForm, {
		onUpdate: ({ form }) => {
			if (isSuccessMessage(form.message as FormMessage)) {
				isEditingMorningDigest = false;
			}
		}
	});

	const {
		form: morningDigestForm,
		errors: morningDigestErrors,
		message: morningDigestMessage,
		submitting: morningDigestSubmitting,
		enhance: morningDigestEnhance
	} = morningDigestFormStore;

	// Profile editing state
	let isEditingProfile = $state(false);
	let isEditingPassword = $state(false);
	let isEditingVisitSettings = $state(false);
	let isEditingDashboardGoals = $state(false);
	let isEditingMorningDigest = $state(false);

	// Derived values from data
	const userEmail = $derived(data.user?.email || '');
	const passwordUpdatedAt = $derived(data.passwordUpdatedAt || '');

	// Reset profile form
	function resetProfileForm() {
		$profileForm.name = data.user?.name || '';
		isEditingProfile = false;
	}

	// Reset password form
	function resetPasswordForm() {
		$passwordForm.currentPassword = '';
		$passwordForm.newPassword = '';
		$passwordForm.confirmPassword = '';
		isEditingPassword = false;
	}

	function setVisitSettingsUnit(nextUnit: 'days' | 'months') {
		const currentUnit = $visitSettingsForm.thresholdUnit;
		if (nextUnit === currentUnit) {
			return;
		}

		const recentToOverdueInDays = convertVisitThresholdToDays(
			Number($visitSettingsForm.recentToOverdueValue),
			currentUnit
		);
		const overdueToCriticalInDays = convertVisitThresholdToDays(
			Number($visitSettingsForm.overdueToCriticalValue),
			currentUnit
		);

		$visitSettingsForm.thresholdUnit = nextUnit;
		$visitSettingsForm.recentToOverdueValue = convertVisitThresholdFromDays(
			Number.isFinite(recentToOverdueInDays)
				? recentToOverdueInDays
				: data.visitThresholds.recentToOverdueDays,
			nextUnit
		);
		$visitSettingsForm.overdueToCriticalValue = convertVisitThresholdFromDays(
			Number.isFinite(overdueToCriticalInDays)
				? overdueToCriticalInDays
				: data.visitThresholds.overdueToCriticalDays,
			nextUnit
		);
	}

	function resetVisitSettingsForm() {
		$visitSettingsForm.thresholdUnit = 'days';
		$visitSettingsForm.recentToOverdueValue = data.visitThresholds.recentToOverdueDays;
		$visitSettingsForm.overdueToCriticalValue = data.visitThresholds.overdueToCriticalDays;
		isEditingVisitSettings = false;
	}

	function resetDashboardGoalSettingsForm() {
		$dashboardGoalSettingsForm.meditationWeeklyGoal = data.dashboardGoals.meditationWeeklyGoal;
		$dashboardGoalSettingsForm.workoutGreenThreshold = data.dashboardGoals.workoutGreenThreshold;
		$dashboardGoalSettingsForm.workoutAmberThreshold = data.dashboardGoals.workoutAmberThreshold;
		isEditingDashboardGoals = false;
	}

	function resetMorningDigestForm() {
		$morningDigestForm.enabled = data.morningDigest.enabled;
		$morningDigestForm.sendTime = data.morningDigest.sendTime;
		isEditingMorningDigest = false;
	}

	// ── Passkeys ────────────────────────────────────────────────────────────
	type Passkey = PageProps['data']['passkeys'][number];

	// `null` until the browser check runs, so the server render doesn't flash the
	// "doesn't support passkeys" note before hydration.
	let passkeySupported = $state<boolean | null>(null);
	let addingPasskey = $state(false);
	let passkeyStatus = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let removeTarget = $state<Passkey | null>(null);
	let removing = $state(false);

	function passkeyLabel(passkey: Passkey) {
		return passkey.name ?? passkey.provider ?? 'Unnamed passkey';
	}

	// Browser-only: WebAuthn isn't available during SSR.
	$effect(() => {
		passkeySupported = isPasskeySupported();
	});

	async function addPasskey() {
		addingPasskey = true;
		passkeyStatus = null;
		try {
			const { error } = await authClient.passkey.addPasskey();
			if (error) {
				const text = passkeyErrorMessage(error);
				if (text) passkeyStatus = { type: 'error', text };
				return;
			}
			passkeyStatus = { type: 'success', text: 'Passkey added.' };
			await invalidateAll();
		} catch (err) {
			const text = passkeyErrorMessage(err);
			if (text) passkeyStatus = { type: 'error', text };
		} finally {
			addingPasskey = false;
		}
	}

	function startRename(passkey: Passkey) {
		renamingId = passkey.id;
		renameValue = passkey.name ?? passkey.provider ?? '';
		passkeyStatus = null;
	}

	const visitThresholdSummary = $derived.by(() => {
		const recentToOverdueInDays = convertVisitThresholdToDays(
			Number($visitSettingsForm.recentToOverdueValue),
			$visitSettingsForm.thresholdUnit
		);
		const overdueToCriticalInDays = convertVisitThresholdToDays(
			Number($visitSettingsForm.overdueToCriticalValue),
			$visitSettingsForm.thresholdUnit
		);

		return {
			recentToOverdueDays: Number.isFinite(recentToOverdueInDays)
				? recentToOverdueInDays
				: data.visitThresholds.recentToOverdueDays,
			overdueToCriticalDays: Number.isFinite(overdueToCriticalInDays)
				? overdueToCriticalInDays
				: data.visitThresholds.overdueToCriticalDays
		};
	});
</script>

<svelte:head><title>Profile</title></svelte:head>

<div class="mx-auto w-full max-w-5xl">
	<LoadErrorAlert message={data.loadError} />
	<div class="ruled mb-8 pb-4">
		<h1 class="page-title" style="--pen: oklch(var(--color-teal))">Profile</h1>
		<p class="text-muted-foreground mt-2">Manage your account information and security settings</p>
	</div>

	<div class="space-y-6">
		<!-- Profile Information Section -->
		<div class="overflow-hidden rounded-lg border shadow">
			<div class="p-6">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<User class="h-5 w-5" />
						<h2 class="text-xl font-semibold">Profile Information</h2>
					</div>
					{#if !isEditingProfile}
						<Button size="sm" variant="outline" onclick={() => (isEditingProfile = true)}>
							<Pencil class="mr-2 h-4 w-4" />
							Edit
						</Button>
					{/if}
				</div>

				<form method="POST" action="?/updateName" use:profileEnhance>
					<div class="space-y-4">
						{#if $profileMessage}
							<div
								class="flex items-center gap-2 rounded-md p-3 {isSuccessMessage($profileMessage)
									? 'border-pen-fitness/35 bg-pen-fitness/12 text-pen-fitness border'
									: 'border-destructive/35 bg-destructive/12 text-destructive border'}"
							>
								{#if isSuccessMessage($profileMessage)}
									<CircleCheck class="h-4 w-4" />
								{:else}
									<CircleAlert class="h-4 w-4" />
								{/if}
								<span class="text-sm">{getMessageText($profileMessage)}</span>
							</div>
						{/if}
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<Label for="name" class="mb-2 block text-sm font-medium">Name</Label>
								<Input
									id="name"
									name="name"
									type="text"
									bind:value={$profileForm.name}
									disabled={!isEditingProfile}
									placeholder="Enter your first name"
									class={$profileErrors.name ? 'border-destructive' : ''}
								/>
								{#if $profileErrors.name}
									<p class="text-destructive mt-1 text-sm">{$profileErrors.name}</p>
								{/if}
							</div>
						</div>

						<div>
							<Label for="email" class="mb-2 block text-sm font-medium">Email Address</Label>
							<Input
								id="email"
								type="email"
								value={userEmail}
								disabled={true}
								placeholder="Email cannot be changed"
								class="bg-muted"
							/>
							<p class="text-muted-foreground mt-1 text-xs">Email address cannot be changed</p>
						</div>

						{#if isEditingProfile}
							<div class="flex gap-2 pt-4">
								<Button type="submit" size="sm" disabled={$profileSubmitting}>
									{#if $profileSubmitting}
										<div
											class="border-primary mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
										></div>
									{:else}
										<Save class="mr-2 h-4 w-4" />
									{/if}
									Save
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onclick={resetProfileForm}
									disabled={$profileSubmitting}
								>
									<X class="mr-2 h-4 w-4" />
									Cancel
								</Button>
							</div>
						{/if}
					</div>
				</form>
			</div>
		</div>

		<Separator.Root />

		<!-- Visit Settings Section -->
		<div class="overflow-hidden rounded-lg border shadow">
			<div class="p-6">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<SlidersHorizontal class="h-5 w-5" />
						<h2 class="text-xl font-semibold">Settings</h2>
					</div>
					{#if !isEditingVisitSettings}
						<Button size="sm" variant="outline" onclick={() => (isEditingVisitSettings = true)}>
							<Pencil class="mr-2 h-4 w-4" />
							Edit
						</Button>
					{/if}
				</div>

				<form method="POST" action="?/updateVisitSettings" use:visitSettingsEnhance>
					<div class="space-y-4">
						{#if $visitSettingsMessage}
							<div
								class="flex items-center gap-2 rounded-md p-3 {isSuccessMessage(
									$visitSettingsMessage
								)
									? 'border-pen-fitness/35 bg-pen-fitness/12 text-pen-fitness border'
									: 'border-destructive/35 bg-destructive/12 text-destructive border'}"
							>
								{#if isSuccessMessage($visitSettingsMessage)}
									<CircleCheck class="h-4 w-4" />
								{:else}
									<CircleAlert class="h-4 w-4" />
								{/if}
								<span class="text-sm">{getMessageText($visitSettingsMessage)}</span>
							</div>
						{/if}

						{#if isEditingVisitSettings}
							<div class="space-y-4">
								<p class="text-muted-foreground text-sm">
									Customize when a person becomes overdue and critical based on days since the last
									visit.
								</p>

								<div class="flex items-center gap-2">
									<Label class="text-sm font-medium">Unit</Label>
									<div class="inline-flex rounded-md border p-1">
										<Button
											type="button"
											size="sm"
											variant={$visitSettingsForm.thresholdUnit === 'days' ? 'default' : 'ghost'}
											onclick={() => setVisitSettingsUnit('days')}
										>
											Days
										</Button>
										<Button
											type="button"
											size="sm"
											variant={$visitSettingsForm.thresholdUnit === 'months' ? 'default' : 'ghost'}
											onclick={() => setVisitSettingsUnit('months')}
										>
											Months
										</Button>
									</div>
									<input
										type="hidden"
										name="thresholdUnit"
										bind:value={$visitSettingsForm.thresholdUnit}
									/>
								</div>

								<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
									<div>
										<Label for="recentToOverdueValue" class="mb-2 block text-sm font-medium">
											Recent to Overdue ({$visitSettingsForm.thresholdUnit})
										</Label>
										<Input
											id="recentToOverdueValue"
											name="recentToOverdueValue"
											type="number"
											step={$visitSettingsForm.thresholdUnit === 'months' ? '0.01' : '1'}
											bind:value={$visitSettingsForm.recentToOverdueValue}
											class={$visitSettingsErrors.recentToOverdueValue ? 'border-destructive' : ''}
											required
										/>
										{#if $visitSettingsErrors.recentToOverdueValue}
											<p class="text-destructive mt-1 text-sm">
												{$visitSettingsErrors.recentToOverdueValue}
											</p>
										{/if}
									</div>

									<div>
										<Label for="overdueToCriticalValue" class="mb-2 block text-sm font-medium">
											Overdue to Critical ({$visitSettingsForm.thresholdUnit})
										</Label>
										<Input
											id="overdueToCriticalValue"
											name="overdueToCriticalValue"
											type="number"
											step={$visitSettingsForm.thresholdUnit === 'months' ? '0.01' : '1'}
											bind:value={$visitSettingsForm.overdueToCriticalValue}
											class={$visitSettingsErrors.overdueToCriticalValue
												? 'border-destructive'
												: ''}
											required
										/>
										{#if $visitSettingsErrors.overdueToCriticalValue}
											<p class="text-destructive mt-1 text-sm">
												{$visitSettingsErrors.overdueToCriticalValue}
											</p>
										{/if}
									</div>
								</div>

								<p class="text-muted-foreground text-xs">
									Saved as {visitThresholdSummary.recentToOverdueDays} days and
									{visitThresholdSummary.overdueToCriticalDays} days.
								</p>

								<div class="flex gap-2 pt-2">
									<Button type="submit" size="sm" disabled={$visitSettingsSubmitting}>
										{#if $visitSettingsSubmitting}
											<div
												class="border-primary mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
											></div>
										{:else}
											<Save class="mr-2 h-4 w-4" />
										{/if}
										Save
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onclick={resetVisitSettingsForm}
										disabled={$visitSettingsSubmitting}
									>
										<X class="mr-2 h-4 w-4" />
										Cancel
									</Button>
								</div>
							</div>
						{:else}
							<div class="text-muted-foreground space-y-2 text-sm">
								<p>
									Recent to Overdue:
									<strong class="text-foreground ml-1">
										{data.visitThresholds.recentToOverdueDays} days (~{convertVisitThresholdFromDays(
											data.visitThresholds.recentToOverdueDays,
											'months'
										)} months)
									</strong>
								</p>
								<p>
									Overdue to Critical:
									<strong class="text-foreground ml-1">
										{data.visitThresholds.overdueToCriticalDays} days (~{convertVisitThresholdFromDays(
											data.visitThresholds.overdueToCriticalDays,
											'months'
										)} months)
									</strong>
								</p>
							</div>
						{/if}
					</div>
				</form>
			</div>
		</div>

		<Separator.Root />

		<!-- Dashboard Goal Settings Section -->
		<div class="overflow-hidden rounded-lg border shadow">
			<div class="p-6">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Gauge class="h-5 w-5" />
						<h2 class="text-xl font-semibold">Dashboard Goals</h2>
					</div>
					{#if !isEditingDashboardGoals}
						<Button size="sm" variant="outline" onclick={() => (isEditingDashboardGoals = true)}>
							<Pencil class="mr-2 h-4 w-4" />
							Edit
						</Button>
					{/if}
				</div>

				<form method="POST" action="?/updateDashboardGoalSettings" use:dashboardGoalSettingsEnhance>
					<div class="space-y-4">
						{#if $dashboardGoalSettingsMessage}
							<div
								class="flex items-center gap-2 rounded-md p-3 {isSuccessMessage(
									$dashboardGoalSettingsMessage
								)
									? 'border-pen-fitness/35 bg-pen-fitness/12 text-pen-fitness border'
									: 'border-destructive/35 bg-destructive/12 text-destructive border'}"
							>
								{#if isSuccessMessage($dashboardGoalSettingsMessage)}
									<CircleCheck class="h-4 w-4" />
								{:else}
									<CircleAlert class="h-4 w-4" />
								{/if}
								<span class="text-sm">{getMessageText($dashboardGoalSettingsMessage)}</span>
							</div>
						{/if}

						{#if isEditingDashboardGoals}
							<div class="space-y-4">
								<p class="text-muted-foreground text-sm">
									Customize the meditation weekly goal and the workout pace thresholds shown on your
									dashboard.
								</p>

								<div>
									<Label for="meditationWeeklyGoal" class="mb-2 block text-sm font-medium">
										Meditation weekly goal (sessions/week)
									</Label>
									<Input
										id="meditationWeeklyGoal"
										name="meditationWeeklyGoal"
										type="number"
										step="1"
										min="1"
										bind:value={$dashboardGoalSettingsForm.meditationWeeklyGoal}
										class={$dashboardGoalSettingsErrors.meditationWeeklyGoal
											? 'border-destructive'
											: ''}
										required
									/>
									{#if $dashboardGoalSettingsErrors.meditationWeeklyGoal}
										<p class="text-destructive mt-1 text-sm">
											{$dashboardGoalSettingsErrors.meditationWeeklyGoal}
										</p>
									{/if}
								</div>

								<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
									<div>
										<Label for="workoutGreenThreshold" class="mb-2 block text-sm font-medium">
											On-pace threshold (sessions/4 weeks)
										</Label>
										<Input
											id="workoutGreenThreshold"
											name="workoutGreenThreshold"
											type="number"
											step="1"
											min="1"
											bind:value={$dashboardGoalSettingsForm.workoutGreenThreshold}
											class={$dashboardGoalSettingsErrors.workoutGreenThreshold
												? 'border-destructive'
												: ''}
											required
										/>
										{#if $dashboardGoalSettingsErrors.workoutGreenThreshold}
											<p class="text-destructive mt-1 text-sm">
												{$dashboardGoalSettingsErrors.workoutGreenThreshold}
											</p>
										{/if}
									</div>

									<div>
										<Label for="workoutAmberThreshold" class="mb-2 block text-sm font-medium">
											Below-pace threshold (sessions/4 weeks)
										</Label>
										<Input
											id="workoutAmberThreshold"
											name="workoutAmberThreshold"
											type="number"
											step="1"
											min="0"
											bind:value={$dashboardGoalSettingsForm.workoutAmberThreshold}
											class={$dashboardGoalSettingsErrors.workoutAmberThreshold
												? 'border-destructive'
												: ''}
											required
										/>
										{#if $dashboardGoalSettingsErrors.workoutAmberThreshold}
											<p class="text-destructive mt-1 text-sm">
												{$dashboardGoalSettingsErrors.workoutAmberThreshold}
											</p>
										{/if}
									</div>
								</div>

								<p class="text-muted-foreground text-xs">
									At or above the on-pace threshold shows green, below it shows amber, and at or
									below the below-pace threshold shows red.
								</p>

								<div class="flex gap-2 pt-2">
									<Button type="submit" size="sm" disabled={$dashboardGoalSettingsSubmitting}>
										{#if $dashboardGoalSettingsSubmitting}
											<div
												class="border-primary mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
											></div>
										{:else}
											<Save class="mr-2 h-4 w-4" />
										{/if}
										Save
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onclick={resetDashboardGoalSettingsForm}
										disabled={$dashboardGoalSettingsSubmitting}
									>
										<X class="mr-2 h-4 w-4" />
										Cancel
									</Button>
								</div>
							</div>
						{:else}
							<div class="text-muted-foreground space-y-2 text-sm">
								<p>
									Meditation weekly goal:
									<strong class="text-foreground ml-1">
										{data.dashboardGoals.meditationWeeklyGoal} session{data.dashboardGoals
											.meditationWeeklyGoal === 1
											? ''
											: 's'}/week
									</strong>
								</p>
								<p>
									Workout pace thresholds:
									<strong class="text-foreground ml-1">
										{data.dashboardGoals.workoutGreenThreshold}+ green ·
										{data.dashboardGoals.workoutAmberThreshold}-{data.dashboardGoals
											.workoutGreenThreshold - 1} amber · below {data.dashboardGoals
											.workoutAmberThreshold} red
									</strong>
								</p>
							</div>
						{/if}
					</div>
				</form>
			</div>
		</div>

		<Separator.Root />

		<!-- Morning Digest Settings Section -->
		<div class="overflow-hidden rounded-lg border shadow">
			<div class="p-6">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Sunrise class="h-5 w-5" />
						<h2 class="text-xl font-semibold">Morning Digest</h2>
					</div>
					{#if !isEditingMorningDigest}
						<Button size="sm" variant="outline" onclick={() => (isEditingMorningDigest = true)}>
							<Pencil class="mr-2 h-4 w-4" />
							Edit
						</Button>
					{/if}
				</div>

				<form method="POST" action="?/updateMorningDigestSettings" use:morningDigestEnhance>
					<div class="space-y-4">
						{#if $morningDigestMessage}
							<div
								class="flex items-center gap-2 rounded-md p-3 {isSuccessMessage(
									$morningDigestMessage
								)
									? 'border-pen-fitness/35 bg-pen-fitness/12 text-pen-fitness border'
									: 'border-destructive/35 bg-destructive/12 text-destructive border'}"
							>
								{#if isSuccessMessage($morningDigestMessage)}
									<CircleCheck class="h-4 w-4" />
								{:else}
									<CircleAlert class="h-4 w-4" />
								{/if}
								<span class="text-sm">{getMessageText($morningDigestMessage)}</span>
							</div>
						{/if}

						{#if isEditingMorningDigest}
							<div class="space-y-4">
								<p class="text-muted-foreground text-sm">
									One push each morning with your agenda, tasks due, tonight's dinner, bills due
									this week and overdue visits. Empty sections are left out.
								</p>

								<label class="flex items-center gap-2 text-sm font-medium">
									<Checkbox
										id="morningDigestEnabled"
										name="enabled"
										bind:checked={$morningDigestForm.enabled}
									/>
									Send the morning digest
								</label>

								<div>
									<Label for="morningDigestSendTime" class="mb-2 block text-sm font-medium">
										Send time (Pacific)
									</Label>
									<Input
										id="morningDigestSendTime"
										name="sendTime"
										type="time"
										bind:value={$morningDigestForm.sendTime}
										class="w-40 {$morningDigestErrors.sendTime ? 'border-destructive' : ''}"
										required
									/>
									{#if $morningDigestErrors.sendTime}
										<p class="text-destructive mt-1 text-sm">
											{$morningDigestErrors.sendTime}
										</p>
									{/if}
								</div>

								<div class="flex gap-2 pt-2">
									<Button type="submit" size="sm" disabled={$morningDigestSubmitting}>
										{#if $morningDigestSubmitting}
											<div
												class="border-primary mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
											></div>
										{:else}
											<Save class="mr-2 h-4 w-4" />
										{/if}
										Save
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onclick={resetMorningDigestForm}
										disabled={$morningDigestSubmitting}
									>
										<X class="mr-2 h-4 w-4" />
										Cancel
									</Button>
								</div>
							</div>
						{:else}
							<div class="text-muted-foreground space-y-2 text-sm">
								<p>
									Status:
									<strong class="text-foreground ml-1">
										{data.morningDigest.enabled
											? `On, sent at ${data.morningDigest.sendTime} Pacific`
											: 'Off'}
									</strong>
								</p>
							</div>
						{/if}
					</div>
				</form>
			</div>
		</div>

		<Separator.Root />

		<!-- Password Change Section -->
		<div class="overflow-hidden rounded-lg border shadow">
			<div class="p-6">
				<div class="mb-4 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Lock class="h-5 w-5" />
						<h2 class="text-xl font-semibold">Change Password</h2>
					</div>
					{#if !isEditingPassword}
						<Button size="sm" variant="outline" onclick={() => (isEditingPassword = true)}>
							<Pencil class="mr-2 h-4 w-4" />
							Change Password
						</Button>
					{/if}
				</div>

				{#if isEditingPassword}
					<form method="POST" action="?/changePassword" use:passwordEnhance>
						<div class="space-y-4">
							{#if $passwordMessage}
								<div
									class="flex items-center gap-2 rounded-md p-3 {isSuccessMessage($passwordMessage)
										? 'border-pen-fitness/35 bg-pen-fitness/12 text-pen-fitness border'
										: 'border-destructive/35 bg-destructive/12 text-destructive border'}"
								>
									{#if isSuccessMessage($passwordMessage)}
										<CircleCheck class="h-4 w-4" />
									{:else}
										<CircleAlert class="h-4 w-4" />
									{/if}
									<span class="text-sm">{getMessageText($passwordMessage)}</span>
								</div>
							{/if}
							<div>
								<Label for="currentPassword" class="mb-2 block text-sm font-medium">
									Current Password
								</Label>
								<Input
									id="currentPassword"
									name="currentPassword"
									type="password"
									bind:value={$passwordForm.currentPassword}
									placeholder="Enter your current password"
									class={$passwordErrors.currentPassword ? 'border-destructive' : ''}
									required
								/>
								{#if $passwordErrors.currentPassword}
									<p class="text-destructive mt-1 text-sm">{$passwordErrors.currentPassword}</p>
								{/if}
							</div>

							<div>
								<Label for="newPassword" class="mb-2 block text-sm font-medium">New Password</Label>
								<Input
									id="newPassword"
									name="newPassword"
									type="password"
									bind:value={$passwordForm.newPassword}
									placeholder="Enter your new password"
									class={$passwordErrors.newPassword ? 'border-destructive' : ''}
									required
								/>
								{#if $passwordErrors.newPassword}
									<p class="text-destructive mt-1 text-sm">{$passwordErrors.newPassword}</p>
								{/if}
							</div>

							<div>
								<Label for="confirmPassword" class="mb-2 block text-sm font-medium">
									Confirm New Password
								</Label>
								<Input
									id="confirmPassword"
									name="confirmPassword"
									type="password"
									bind:value={$passwordForm.confirmPassword}
									placeholder="Confirm your new password"
									class={$passwordErrors.confirmPassword ? 'border-destructive' : ''}
									required
								/>
								{#if $passwordErrors.confirmPassword}
									<p class="text-destructive mt-1 text-sm">{$passwordErrors.confirmPassword}</p>
								{/if}
							</div>

							<div class="flex gap-2 pt-4">
								<Button type="submit" size="sm" disabled={$passwordSubmitting}>
									{#if $passwordSubmitting}
										<div
											class="border-primary mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
										></div>
									{:else}
										<Save class="mr-2 h-4 w-4" />
									{/if}
									Change Password
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onclick={resetPasswordForm}
									disabled={$passwordSubmitting}
								>
									<X class="mr-2 h-4 w-4" />
									Cancel
								</Button>
							</div>
						</div>
					</form>
				{:else}
					<div class="text-muted-foreground text-sm">
						{#if passwordUpdatedAt}
							<p>Password was last updated on {new Date(passwordUpdatedAt).toLocaleDateString()}</p>
						{/if}
						<p class="mt-1">Click "Change Password" to update your password.</p>
					</div>
				{/if}
			</div>
		</div>

		<Separator.Root />

		<!-- Passkeys Section -->
		<div class="overflow-hidden rounded-lg border shadow">
			<div class="space-y-4 p-6">
				<div>
					<div class="mb-4 flex items-center gap-2">
						<KeyRound class="h-5 w-5" />
						<h2 class="text-xl font-semibold">Passkeys</h2>
					</div>
					<p class="text-muted-foreground text-sm">
						Sign in with Face ID, Touch ID or your device PIN instead of a password.
					</p>
				</div>

				<LoadErrorAlert message={data.passkeysLoadError} class="" />

				{#if passkeyStatus}
					<div
						class={passkeyStatus.type === 'success'
							? 'border-pen-fitness/35 bg-pen-fitness/12 text-pen-fitness flex items-center gap-2 rounded-md border p-3'
							: 'border-destructive/35 bg-destructive/12 text-destructive flex items-center gap-2 rounded-md border p-3'}
						role={passkeyStatus.type === 'success' ? 'status' : 'alert'}
					>
						{#if passkeyStatus.type === 'success'}
							<CircleCheck class="h-4 w-4" />
						{:else}
							<CircleAlert class="h-4 w-4" />
						{/if}
						<span class="text-sm">{passkeyStatus.text}</span>
					</div>
				{/if}

				{#if data.passkeys.length === 0 && !data.passkeysLoadError}
					<p class="text-muted-foreground text-sm">No passkeys yet.</p>
				{:else}
					<ul class="space-y-3">
						{#each data.passkeys as passkey (passkey.id)}
							<li class="bg-muted/40 rounded-md border p-3">
								{#if renamingId === passkey.id}
									<form
										method="POST"
										action="?/renamePasskey"
										class="flex flex-wrap items-end gap-2"
										use:enhanceAction={() =>
											async ({ result, update }) => {
												if (result.type === 'success') {
													renamingId = null;
													passkeyStatus = { type: 'success', text: 'Passkey renamed.' };
												} else {
													passkeyStatus = {
														type: 'error',
														text: actionMessage(result, {
															success: 'Passkey renamed.',
															error: 'Could not rename that passkey. Please try again.'
														}).text
													};
												}
												await update({ reset: false });
											}}
									>
										<input type="hidden" name="id" value={passkey.id} />
										<Label class="block min-w-48 flex-1">
											<span class="font-semibold">Passkey name</span>
											<Input
												type="text"
												name="name"
												bind:value={renameValue}
												class="mt-1"
												required
												maxlength={PASSKEY_NAME_MAX}
												autocomplete="off"
											/>
										</Label>
										<Button type="submit">Save</Button>
										<Button type="button" variant="outline" onclick={() => (renamingId = null)}>
											Cancel
										</Button>
									</form>
								{:else}
									<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div>
											<p class="font-medium">{passkeyLabel(passkey)}</p>
											{#if passkey.createdAt}
												<p class="text-muted-foreground text-sm">
													added {formatTimestampShort(passkey.createdAt)}
												</p>
											{/if}
										</div>
										<div class="flex flex-wrap items-center gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												aria-label="Rename {passkeyLabel(passkey)}"
												onclick={() => startRename(passkey)}
											>
												Rename
											</Button>
											<Button
												type="button"
												size="sm"
												variant="destructive"
												aria-label="Remove {passkeyLabel(passkey)}"
												onclick={() => {
													removeTarget = passkey;
													passkeyStatus = null;
												}}
											>
												Remove
											</Button>
										</div>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if passkeySupported}
					<Button
						type="button"
						disabled={addingPasskey}
						aria-busy={addingPasskey}
						onclick={addPasskey}
					>
						{#if addingPasskey}
							<Spinner aria-hidden="true" />
							Waiting for your device…
						{:else}
							<Plus />
							Add a passkey
						{/if}
					</Button>
				{:else if passkeySupported === false}
					<p class="text-muted-foreground text-sm">This browser doesn't support passkeys.</p>
				{/if}
			</div>
		</div>
	</div>
</div>

<Dialog.Root
	open={removeTarget !== null}
	onOpenChange={(open) => {
		if (!open) removeTarget = null;
	}}
>
	<Dialog.Content aria-label="Remove passkey">
		{#if removeTarget}
			<div class="space-y-4">
				<Dialog.Title class="text-xl font-bold tracking-tight">
					Remove {passkeyLabel(removeTarget)}?
				</Dialog.Title>
				<Dialog.Description>
					It will stop signing you in. You can still sign in with your password and add it again
					later.
				</Dialog.Description>
				<form
					method="POST"
					action="?/removePasskey"
					class="flex gap-2"
					use:enhanceAction={() => {
						removing = true;
						return async ({ result, update }) => {
							removing = false;
							passkeyStatus =
								result.type === 'success'
									? { type: 'success', text: 'Passkey removed.' }
									: {
											type: 'error',
											text: actionMessage(result, {
												success: 'Passkey removed.',
												error: 'Could not remove that passkey. Please try again.'
											}).text
										};
							removeTarget = null;
							await update();
						};
					}}
				>
					<input type="hidden" name="id" value={removeTarget.id} />
					<Button type="submit" variant="destructive" disabled={removing} aria-busy={removing}>
						{removing ? 'Removing…' : 'Remove passkey'}
					</Button>
					<Button type="button" variant="outline" onclick={() => (removeTarget = null)}>
						Cancel
					</Button>
				</form>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
