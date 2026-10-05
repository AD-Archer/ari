<script lang="ts">
	import { EmptyState, Icon, Lightbox, type LightboxItem } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import { formatClock } from '$lib/time';
	import EvidenceBody from './EvidenceBody.svelte';
	import MakerTag from './MakerTag.svelte';
	import SecondsEditor from './SecondsEditor.svelte';

	const { context, cursor } = useReview();

	const clips = $derived(context.data.evidence.clips);
	const playable = $derived(clips.filter((clip) => clip.url));
	const videos = $derived<LightboxItem[]>(
		playable.map((clip) => ({
			src: clip.url ?? '',
			alt: clip.note || 'Timelapse',
			kind: 'video',
			caption: [clip.note, clip.when].filter(Boolean).join(' · ')
		}))
	);

	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	let grid = $state<HTMLElement>();

	$effect(() => {
		void context.ship.id;
		lightboxOpen = false;
	});

	function play(clipId: string) {
		const position = playable.findIndex((clip) => clip.id === clipId);
		if (position < 0) return false;
		lightboxIndex = position;
		lightboxOpen = true;
		return true;
	}

	// a clip with no recording has nothing to open, so enter goes to its time instead
	function open(index: number) {
		const clip = clips[index];
		if (clip && !play(clip.id)) cursor.currentTimeInput()?.focus();
	}

	// how many clips share the first visual line: the arrow keys step by it
	const columns = () =>
		grid ? Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length) : 1;

	$effect(() => cursor.registerRows('elapsed', { count: () => clips.length, columns, open }));
</script>

{#snippet thumbnail(url: string | null, lengthSeconds: number)}
	{#if url}<img src={url} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
	<span class="play"><Icon name="play" size={16} /></span>
	<span class="length">{formatClock(lengthSeconds)}</span>
{/snippet}

<EvidenceBody>
	{#if clips.length === 0}
		<EmptyState title="No timelapses" icon="film">
			No timelapses were captured when this ship was registered.
		</EmptyState>
	{:else}
		<div class="lapseGrid" bind:this={grid}>
			{#each clips as clip, index (clip.id)}
				{@const current = cursor.isCurrent('elapsed', index)}
				<div
					id={cursor.rowId('elapsed', index)}
					class={{ clip: true, current }}
					aria-current={current ? 'true' : undefined}
					onfocusin={() => cursor.select('elapsed', index)}
				>
					{#if clip.url}
						<button
							type="button"
							class="thumbnail"
							aria-label="Play timelapse: {clip.note || clip.when}"
							onclick={() => {
								cursor.select('elapsed', index);
								play(clip.id);
							}}
						>
							{@render thumbnail(clip.thumbnailUrl, clip.lengthSeconds)}
						</button>
					{:else}
						<div class="thumbnail" title="This clip has no recording to play">
							{@render thumbnail(clip.thumbnailUrl, clip.lengthSeconds)}
						</div>
					{/if}
					<div class="copy">
						{#if clip.note}<div class="note">{clip.note}</div>{/if}
						{#if clip.makerName}<MakerTag makerId={clip.makerId} name={clip.makerName} />{/if}
						<div class="meta">
							<span>{clip.when}</span>
							<SecondsEditor
								kind="clips"
								rowId={clip.id}
								capturedSeconds={clip.lengthSeconds}
								label="timelapse {index + 1}"
							/>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</EvidenceBody>

<Lightbox bind:open={lightboxOpen} bind:index={lightboxIndex} items={videos} />

<style>
	.lapseGrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 260px));
		gap: var(--space-3);
		padding: var(--space-2) 0 var(--space-1);
	}
	.clip {
		min-width: 0;
		padding: var(--space-1);
		border-radius: var(--radius-lg);
	}
	.clip.current {
		background: var(--surface-2);
		box-shadow: inset 0 0 0 1px var(--border-2);
	}
	.thumbnail {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		padding: 0;
		overflow: hidden;
		border: 0;
		border-radius: var(--radius-md);
		background: var(--surface-3);
		color: inherit;
		font: inherit;
	}
	button.thumbnail {
		cursor: pointer;
	}
	.thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* the two labels sit on the picture, so they keep one dark plate in both themes */
	.play,
	.length {
		position: absolute;
		background: color-mix(in srgb, black 65%, transparent);
		color: white;
	}
	.play {
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		margin: auto;
		border-radius: 50%;
	}
	.length {
		right: var(--space-2);
		bottom: var(--space-2);
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.copy {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		padding: var(--space-2) 2px 2px;
	}
	.note {
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	@container evidenceTile (max-width: 560px) {
		.lapseGrid {
			grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
		}
	}
</style>
