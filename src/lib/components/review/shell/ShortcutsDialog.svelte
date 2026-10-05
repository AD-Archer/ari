<script lang="ts">
	import { Button, Dialog, Kbd } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';

	const { keybinds } = useReview();

	const listening = (id: string) => keybinds.capturing === id;
</script>

<!-- while a key is being captured escape cancels the capture, so it must not close the dialog -->
<Dialog
	bind:open={keybinds.helpOpen}
	title="Keyboard shortcuts"
	description="Click a key, then press the one you want. Decision combos work even while typing in the notes."
	size="lg"
	dismissible={!keybinds.capturing}
	onClose={() => keybinds.closeHelp()}
>
	<ul class="rows" data-review-region="shortcuts">
		{#each keybinds.rows as row (row.id)}
			<li class={{ inactive: !row.active }} data-shortcut={row.id}>
				<span class="label">{row.label}</span>
				{#if row.custom}
					<Button
						size="sm"
						variant="quiet"
						icon="refresh"
						aria-label="Reset {row.label} to its default"
						title="Reset to default"
						onclick={() => keybinds.reset(row.id)}
					/>
				{/if}
				<Button
					size="sm"
					variant={listening(row.id) ? 'primary' : 'ghost'}
					aria-pressed={listening(row.id)}
					title={keybinds.title(row.id, row.label)}
					data-shortcut-key
					onclick={() => keybinds.capture(listening(row.id) ? null : row.id)}
				>
					{listening(row.id) ? 'press a key…' : row.keys}
				</Button>
			</li>
		{/each}
		{#each keybinds.fixedRows as row (row.id)}
			<li class="reference">
				<span class="label">{row.label}</span>
				<Kbd keys={row.keys} />
			</li>
		{/each}
		<li class="reference">
			<span class="label">Cancel / close dialog</span>
			<Kbd keys="Esc" />
		</li>
	</ul>
	{#snippet footer()}
		<Button variant="quiet" onclick={() => keybinds.resetAll()}>Reset all</Button>
		<Button variant="primary" onclick={() => keybinds.closeHelp()}>Done</Button>
	{/snippet}
</Dialog>

<style>
	.rows {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		column-gap: var(--space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-md);
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}
	.label {
		flex: 1;
		min-width: 0;
	}
	.inactive .label,
	.reference .label {
		color: var(--text-3);
	}
</style>
