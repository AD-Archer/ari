<script lang="ts">
	import { TextField, Toggle } from '$lib/components/ui';
	import { reauthTtlProblem, reviewGoalProblem, wholeNumber } from '$lib/programRules';
	import OptionGroup from '$lib/components/app/OptionGroup.svelte';
	import type { ProgramWizard } from '../programWizard.svelte';

	interface Props {
		wizard: ProgramWizard;
	}
	let { wizard }: Props = $props();

	const draft = $derived(wizard.draft);
	const creating = $derived(!wizard.editing);
</script>

{#if wizard.canManage}
	<OptionGroup label="Reviewer VMs">
		<Toggle
			label="Allow reviewer VMs"
			description="Reviewers can launch a throwaway Linux/Windows/Android VM to run the project"
			bind:checked={draft.allowVms}
		/>
	</OptionGroup>
{/if}

<OptionGroup label="Second pass">
	<Toggle
		label="Second pass review"
		description="Reviewer approvals wait for an organizer's sign-off before going out to the program"
		bind:checked={draft.secondPass}
	/>
	{#if creating && draft.secondPass}
		<OptionGroup label="What second pass holds" nested>
			<Toggle label="Hold approvals" bind:checked={draft.secondPassApproved} />
			<Toggle label="Hold changes requests" bind:checked={draft.secondPassChanges} />
			<Toggle label="Hold rejections" bind:checked={draft.secondPassRejected} />
			<Toggle label="Organizers skip the hold" bind:checked={draft.secondPassOrganizerBypass} />
		</OptionGroup>
	{/if}
</OptionGroup>

{#if creating}
	<OptionGroup label="Review workflow">
		<Toggle
			label="Can't review own projects"
			description="Reviewers can't see or open ships they're a maker on (solo or collaborator)"
			bind:checked={draft.cantReviewOwn}
		/>
		<Toggle
			label="Hour deflation"
			description="Reviewers and organizers can decide to deflate the hours of a shipped project"
			bind:checked={draft.allowDeflation}
		/>
		<Toggle
			label="Hours justification"
			description={wizard.canManage
				? 'An approval needs the technical features that account for the hours, and any deflation needs a reason'
				: 'An approval needs the technical features that account for the hours, and any deflation needs a reason. Ask someone who manages programs if you need it turned off'}
			disabled={!wizard.canManage}
			bind:checked={draft.hoursJustification}
		/>
		<Toggle
			label="Priority review"
			description="Makers request priority review of their queued ships through a public form"
			bind:checked={draft.priorityReview}
		/>
		<Toggle
			label="Re-authenticate before reviewing"
			description="Anyone opening a ship to review it must first re-verify with Hack Club Auth"
			bind:checked={draft.reviewerReauth}
		/>
		{#if draft.reviewerReauth}
			<OptionGroup label="Re-authentication" nested>
				<div class="narrow">
					<TextField
						label="Inactivity timeout (minutes)"
						name="reviewerReauthTtlMinutes"
						inputmode="numeric"
						autocomplete="off"
						error={reauthTtlProblem(true, wholeNumber(draft.reviewerReauthTtlMinutes))}
						bind:value={draft.reviewerReauthTtlMinutes}
					/>
				</div>
			</OptionGroup>
		{/if}
	</OptionGroup>
	<div class="narrow">
		<TextField
			label="Weekly review goal"
			name="reviewGoal"
			inputmode="numeric"
			autocomplete="off"
			hint="Per-reviewer target for the week. Drives the review header's goal bar."
			error={reviewGoalProblem(wholeNumber(draft.reviewGoal))}
			bind:value={draft.reviewGoal}
		/>
	</div>
{/if}

<style>
	.narrow {
		max-width: 260px;
	}
</style>
