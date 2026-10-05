<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { submitAction } from '$lib/actions';
	import {
		AvatarStack,
		Button,
		Dialog,
		ImageUpload,
		Notice,
		SegmentedControl,
		Textarea,
		TextField
	} from '$lib/components/ui';
	import type { ActionFailure, DispatchOutcome, ShipEditResult } from '$lib/review/reviewTypes';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import { toast } from '$lib/toast.svelte';

	interface Props {
		open?: boolean;
	}
	let { open = $bindable(false) }: Props = $props();

	const { context, claim, refusal } = useReview();
	const uid = $props.id();
	const actionUrl = $derived(`/p/${context.programId}/review/${context.ship.id}`);

	type ShipTrack = 'software' | 'hardware';
	const trackOptions: { value: ShipTrack; label: string }[] = [
		{ value: 'software', label: 'Software' },
		{ value: 'hardware', label: 'Hardware' }
	];

	const blank = () => ({
		title: '',
		track: 'software' as ShipTrack,
		description: '',
		thumbnailUrl: '',
		repoUrl: '',
		demoUrl: '',
		hackatimeProjects: '',
		authorNames: [] as { email: string; name: string }[]
	});
	let fields = $state(blank());
	let saving = $state(false);
	let failure = $state<string | null>(null);

	// every open starts from the ship as it is now, not from an abandoned edit
	let wasOpen = false;
	$effect.pre(() => {
		if (open && !wasOpen) {
			const ship = context.ship;
			failure = null;
			fields = {
				title: ship.title,
				track: ship.track,
				description: ship.description ?? '',
				thumbnailUrl: ship.thumbnailUrl ?? '',
				repoUrl: ship.repoUrl,
				demoUrl: ship.demoUrl ?? '',
				hackatimeProjects: context.data.hackatimeProjects.map((project) => project.name).join('\n'),
				authorNames: context.data.authors.map((author) => ({
					email: author.email,
					name: author.name || author.email
				}))
			};
		}
		wasOpen = open;
	});

	const slackIdOf = (email: string) =>
		context.data.makers.find((maker) => maker.email.toLowerCase() === email.toLowerCase())
			?.slackId ?? null;
	const previewPeople = $derived(
		fields.authorNames.map((author) => ({
			name: author.name.trim() || author.email,
			slackId: slackIdOf(author.email)
		}))
	);
	// the same joining the header shows, so the names read here as they will there
	const previewNames = $derived.by(() => {
		const names = previewPeople.map((person) => person.name);
		return names.length <= 1
			? (names[0] ?? '')
			: `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
	});

	// null when the program was told, or has no endpoint to tell
	function untoldReason(outcome: DispatchOutcome | undefined): string | null {
		if (!outcome || outcome === 'queued' || outcome === 'noEndpoint') return null;
		const saved = 'The edit is saved, but the program was not told: ';
		if (outcome === 'notSigned') return `${saved}its webhook endpoint has no signing secret.`;
		if (outcome === 'blockedUrl') return `${saved}its webhook URL is not allowed.`;
		return `${saved}the webhook could not be queued.`;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (saving || !claim.guardLock()) return;
		saving = true;
		failure = null;
		const result = await submitAction<ShipEditResult & Record<string, unknown>>(
			'editShip',
			{
				title: fields.title,
				track: fields.track,
				description: fields.description,
				thumbnailUrl: fields.thumbnailUrl,
				repoUrl: fields.repoUrl,
				demoUrl: fields.demoUrl,
				hackatimeProjects: JSON.stringify(
					fields.hackatimeProjects
						.split(/\r?\n/)
						.map((project) => project.trim())
						.filter(Boolean)
				),
				authorNames: JSON.stringify(
					Object.fromEntries(
						fields.authorNames.map((author) => [author.email.toLowerCase(), author.name])
					)
				)
			},
			{ actionUrl, invalidate: false, fallbackMessage: 'Could not save the ship edits.' }
		);
		saving = false;
		if (!result.ok) {
			const code = (result.data as Partial<ActionFailure> | undefined)?.code;
			// the ship is no longer this reviewer's to edit: show it as it is now
			if (code === 'claimHeldByOther' || code === 'shipClosed' || code === 'reauthRequired') {
				open = false;
				await refusal.handle(null, result);
				return;
			}
			failure = result.message;
			return;
		}
		open = false;
		await invalidateAll();
		if (result.data?.unchanged) {
			toast.info('No ship details changed');
			return;
		}
		toast.success('Ship details updated');
		const untold = untoldReason(result.data?.webhook);
		if (untold) toast.error(untold);
		if (result.data?.resyncError) toast.error(result.data.resyncError, { icon: 'flag' });
		else if (result.data?.resyncQueued)
			toast.info('A fresh evidence capture was started', { icon: 'refresh' });
	}
</script>

<Dialog
	bind:open
	title="Edit ship"
	description="Corrections are sent to the program and retained in the audit trail."
	icon="config"
	size="lg"
	dismissible={!saving}
>
	<form id="{uid}-form" class="shipEdit" data-review-region="shipEdit" onsubmit={save}>
		{#if failure}
			<div class="span"><Notice tone="danger">{failure}</Notice></div>
		{/if}
		<!-- the maxlength values below are the caps the editShip action enforces -->
		<div class="span">
			<TextField
				label="Ship title"
				name="title"
				maxlength={200}
				required
				data-autofocus
				bind:value={fields.title}
			/>
		</div>
		{#if context.viewer.canOverride}
			<fieldset class="span group">
				<legend>Ship type</legend>
				<SegmentedControl label="Ship type" options={trackOptions} bind:value={fields.track} />
			</fieldset>
		{/if}
		<div class="span">
			<Textarea
				label="Ship description"
				name="description"
				rows={4}
				maxlength={5000}
				required
				bind:value={fields.description}
			/>
		</div>
		<fieldset class="span group">
			<legend>Ship author name{fields.authorNames.length === 1 ? '' : 's'}</legend>
			{#each fields.authorNames as author, index (author.email)}
				<TextField
					label={author.email}
					name="author{index}"
					maxlength={100}
					required
					bind:value={fields.authorNames[index].name}
				/>
			{/each}
			<p class="preview">
				<span class="muted">Shown as</span>
				<AvatarStack people={previewPeople} size="sm" />
				<strong>{previewNames}</strong>
				{#if fields.authorNames.length > 1}
					<span class="muted">· {fields.authorNames.length} collaborators</span>
				{/if}
			</p>
		</fieldset>
		<fieldset class="span group">
			<legend>Ship thumbnail</legend>
			<ImageUpload
				label="ship thumbnail"
				mode="wide"
				hint="Shown as the cover on the review screen"
				{actionUrl}
				bind:value={fields.thumbnailUrl}
			/>
		</fieldset>
		<TextField
			label="Repository"
			name="repoUrl"
			type="url"
			required
			placeholder="https://github.com/…"
			bind:value={fields.repoUrl}
		/>
		<TextField
			label="Live demo"
			name="demoUrl"
			type="url"
			required={fields.track === 'software'}
			placeholder="https://…"
			bind:value={fields.demoUrl}
		/>
		<div class="span">
			<Textarea
				label="Hackatime projects"
				name="hackatimeProjects"
				rows={4}
				placeholder="One exact project name per line"
				hint="Changing the repository or Hackatime projects starts a fresh evidence capture."
				bind:value={fields.hackatimeProjects}
			/>
		</div>
	</form>
	{#snippet footer()}
		<Button disabled={saving} onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" icon="check" type="submit" form="{uid}-form" loading={saving}>
			{saving ? 'Saving…' : 'Save changes'}
		</Button>
	{/snippet}
</Dialog>

<style>
	.shipEdit {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
	}
	.span {
		grid-column: 1 / -1;
		min-width: 0;
	}
	.group {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}
	legend {
		padding: 0;
		margin-bottom: var(--space-1);
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.preview {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		min-width: 0;
		font-size: var(--text-sm);
	}
	.preview strong {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.muted {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	@media (max-width: 700px) {
		.shipEdit {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
