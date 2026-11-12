<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		CircleAlert,
		CircleCheck,
		Gauge,
		KeyRound,
		Lock,
		Pencil,
		Save,
		Sunrise,
		SlidersHorizontal,
		Trash2,
		User,
		X
	} from '@lucide/svelte';
	import { passkeyErrorMessage, isPasskeySupported } from '@sheppakai/shared/passkey-client';
	import { onMount } from 'svelte';
	import { superForm } from 'sveltekit-superforms';

	import LoadErrorAlert from '#lib/components/shared/LoadErrorAlert.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Separator from '#lib/components/ui/separator/index.js';
	import { authClient } from '#lib/passkey-client.js';
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

	type PasskeyListItem = {
		id: string;
		name: string | null;
		createdAt: string | Date;
	};

	function toPasskeyListItem(value: unknown): PasskeyListItem | null {
		if (!value || typeof value !== 'object') return null;

		const record = value as Record<string, unknown>;
		const id = typeof record.id === 'string' ? record.id : null;
		const createdAt = record.createdAt;
		const createdAtValid = typeof createdAt === 'string' || createdAt instanceof Date;

		if (!id || !createdAtValid) return null;

		return {
			id,
			name: typeof record.name === 'string' ? record.name : null,
			createdAt
		};
	}

	function formatPasskeyDate(createdAt: string | Date): string {
		return formatTimestampShort(createdAt);
	}

	let passkeySupported = $state(false);
	let passkeys = $state<PasskeyListItem[]>([]);
	let passkeysLoading = $state(false);
	let passkeyError = $state<string | null>(null);
	let passkeySuccess = $state<string | null>(null);
	let addingPasskey = $state(false);
	let newPasskeyName = $state('');
	let renamingPasskeyId = $state<string | null>(null);
	let renamingPasskeyName = $state('');
	let removingPasskeyId = $state<string | null>(null);
	const canSavePasskeyRename = $derived(renamingPasskeyName.trim().length > 0);

	async function loadPasskeys() {
		if (!passkeySupported) return;

		passkeysLoading = true;
		passkeyError = null;
		const { data: passkeyData, error } = await authClient.passkey.listUserPasskeys();

		passkeysLoading = false;
		if (error) {
			passkeys = [];
			passkeyError = passkeyErrorMessage(error) ?? 'Could not load passkeys. Try refreshing.';
			return;
		}

		const nextPasskeys = Array.isArray(passkeyData)
			? passkeyData
					.map((entry) => toPasskeyListItem(entry))
					.filter((entry): entry is PasskeyListItem => entry !== null)
			: [];
		passkeys = nextPasskeys;
	}

	async function addPasskey() {
		passkeyError = null;
		passkeySuccess = null;
		addingPasskey = true;

		const trimmedName = newPasskeyName.trim();
		const { error } = await authClient.passkey.addPasskey({
			name: trimmedName.length > 0 ? trimmedName : undefined
		});

		addingPasskey = false;
		if (error) {
			passkeyError = passkeyErrorMessage(error);
			return;
		}

		newPasskeyName = '';
		passkeySuccess = 'Passkey added.';
		await invalidateAll();
		await loadPasskeys();
	}

	function startPasskeyRename(passkey: PasskeyListItem) {
		passkeyError = null;
		passkeySuccess = null;
		renamingPasskeyId = passkey.id;
		renamingPasskeyName = passkey.name ?? '';
	}

	function cancelPasskeyRename() {
		renamingPasskeyId = null;
		renamingPasskeyName = '';
	}

	async function savePasskeyRename(id: string) {
		if (!canSavePasskeyRename) return;

		passkeyError = null;
		passkeySuccess = null;
		const { error } = await authClient.passkey.updatePasskey({
			id,
			name: renamingPasskeyName.trim()
		});

		if (error) {
			passkeyError = passkeyErrorMessage(error);
			return;
		}

		cancelPasskeyRename();
		passkeySuccess = 'Passkey renamed.';
		await invalidateAll();
		await loadPasskeys();
	}

	async function removePasskey(id: string) {
		passkeyError = null;
		passkeySuccess = null;
		removingPasskeyId = id;
		const { error } = await authClient.passkey.deletePasskey({ id });
		removingPasskeyId = null;

		if (error) {
			passkeyError = passkeyErrorMessage(error);
			return;
		}

		if (renamingPasskeyId === id) {
			cancelPasskeyRename();
		}
		passkeySuccess = 'Passkey removed.';
		await invalidateAll();
		await loadPasskeys();
	}

	onMount(() => {
		passkeySupported = isPasskeySupported();
		if (passkeySupported) {
			void loadPasskeys();
		}
	});

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
			<div class="p-6">
				<div class="mb-4 flex items-center gap-2">
					<KeyRound class="h-5 w-5" />
					<h2 class="text-xl font-semibold">Passkeys</h2>
				</div>
				<p class="text-muted-foreground mb-4 text-sm">
					Sign in with Face ID, Touch ID or your device PIN instead of a password.
				</p>

				{#if passkeySuccess}
					<div
						class="border-pen-fitness/35 bg-pen-fitness/12 text-pen-fitness mb-4 flex items-center gap-2 rounded-md border p-3"
					>
						<CircleCheck class="h-4 w-4" />
						<span class="text-sm">{passkeySuccess}</span>
					</div>
				{/if}
				{#if passkeyError}
					<div
						class="border-destructive/35 bg-destructive/12 text-destructive mb-4 flex items-center gap-2 rounded-md border p-3"
						role="alert"
					>
						<CircleAlert class="h-4 w-4" />
						<span class="text-sm">{passkeyError}</span>
					</div>
				{/if}

				{#if !passkeySupported}
					<p class="text-muted-foreground text-sm">Passkeys are not supported in this browser.</p>
				{:else if passkeysLoading}
					<p class="text-muted-foreground text-sm">Loading passkeys…</p>
				{:else}
					<div class="space-y-3">
						{#if passkeys.length === 0}
							<p class="text-muted-foreground text-sm">No passkeys added yet.</p>
						{:else}
							{#each passkeys as passkey (passkey.id)}
								<div
									class="bg-muted/40 flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
								>
									<div>
										<p class="font-medium">{passkey.name || 'Unnamed passkey'}</p>
										<p class="text-muted-foreground text-xs">
											Added {formatPasskeyDate(passkey.createdAt)}
										</p>
									</div>
									<div class="flex flex-wrap items-center gap-2">
										{#if renamingPasskeyId === passkey.id}
											<Input
												class="h-8 w-48"
												type="text"
												bind:value={renamingPasskeyName}
												placeholder="Passkey name"
											/>
											<Button
												type="button"
												size="sm"
												onclick={() => savePasskeyRename(passkey.id)}
												disabled={!canSavePasskeyRename}
											>
												Save
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline"
												onclick={cancelPasskeyRename}
											>
												Cancel
											</Button>
										{:else}
											<Button
												type="button"
												size="sm"
												variant="outline"
												onclick={() => startPasskeyRename(passkey)}
											>
												Rename
											</Button>
										{/if}
										<Button
											type="button"
											size="sm"
											variant="destructive"
											onclick={() => removePasskey(passkey.id)}
											disabled={removingPasskeyId === passkey.id}
										>
											<Trash2 class="mr-2 h-4 w-4" />
											{#if removingPasskeyId === passkey.id}
												Removing…
											{:else}
												Remove
											{/if}
										</Button>
									</div>
								</div>
							{/each}
						{/if}
					</div>

					<form
						class="mt-5 space-y-3 rounded-md border p-4"
						onsubmit={(event) => {
							event.preventDefault();
							void addPasskey();
						}}
					>
						<div class="space-y-2">
							<Label for="newPasskeyName" class="text-sm font-medium">Passkey name (optional)</Label
							>
							<Input
								id="newPasskeyName"
								type="text"
								bind:value={newPasskeyName}
								placeholder="e.g. iPhone"
							/>
						</div>
						<Button type="submit" size="sm" disabled={addingPasskey}>
							{#if addingPasskey}
								Adding…
							{:else}
								Add a passkey
							{/if}
						</Button>
					</form>
				{/if}
			</div>
		</div>
	</div>
</div>
