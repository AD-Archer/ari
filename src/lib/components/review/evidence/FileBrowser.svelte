<script lang="ts">
	import { privateProvider } from '$private';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { Button, Dialog, EmptyState, Icon, Notice } from '$lib/components/ui';
	import type { FileHour } from '$lib/review/reviewTypes';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import { formatDuration } from '$lib/time';
	import EvidenceBody from './EvidenceBody.svelte';
	import { buildFileTree, formatBytes, type DirectoryNode } from './fileTree';

	interface Source {
		ok: boolean;
		content?: string;
		truncated?: boolean;
		message?: string;
	}

	const { context } = useReview();

	const files = $derived(context.data.fileHours ?? []);
	const inRepository = $derived(files.filter((file) => file.status === 'head'));
	// tracked files the repository does not have belong to the private module
	const outside = $derived(files.filter((file) => file.status !== 'head'));
	const Extras = privateProvider.slots.reviewFileExtras;
	const tree = $derived(buildFileTree(inRepository));
	const trackedSeconds = $derived(tree.seconds);
	const busiestSeconds = $derived(Math.max(1, ...inRepository.map((file) => file.seconds)));

	const collapsed = new SvelteSet<string>();
	const cache = new SvelteMap<string, Source>();
	let viewing = $state<FileHour | null>(null);
	let viewerOpen = $state(false);
	let loading = $state(false);
	const source = $derived(viewing ? (cache.get(viewing.path) ?? null) : null);

	// a new ship reuses this component: nothing read for the last one may show
	$effect(() => {
		void context.ship.id;
		cache.clear();
		collapsed.clear();
		viewerOpen = false;
		viewing = null;
	});

	const githubUrl = $derived.by(() => {
		try {
			return new URL(context.repoUrl).hostname === 'github.com' ? context.repoUrl : null;
		} catch {
			return null;
		}
	});

	function toggle(path: string) {
		if (collapsed.has(path)) collapsed.delete(path);
		else collapsed.add(path);
	}

	async function load(file: FileHour): Promise<Source> {
		const shipId = context.ship.id;
		try {
			const response = await fetch(
				`/p/${context.programId}/review/${shipId}/filesource?path=${encodeURIComponent(file.path)}`
			);
			if (!response.ok) throw new Error(`http ${response.status}`);
			const answer = (await response.json()) as Source;
			// only a real answer is kept: a failed request can be tried again
			if (shipId === context.ship.id) cache.set(file.path, answer);
			return answer;
		} catch {
			return { ok: false, message: 'Could not load the file right now. Try again.' };
		}
	}

	let failure = $state<string | null>(null);
	async function view(file: FileHour) {
		viewing = file;
		viewerOpen = true;
		failure = null;
		if (cache.has(file.path)) return;
		loading = true;
		const answer = await load(file);
		// the reviewer may have opened another file meanwhile
		if (viewing?.path !== file.path) return;
		loading = false;
		if (!cache.has(file.path)) failure = answer.message ?? 'Could not load the file.';
	}

	const lineNumbers = $derived(
		source?.ok && source.content !== undefined
			? source.content
					.split('\n')
					.map((text, line) => line + 1)
					.join('\n')
			: ''
	);
	const shipRef = $derived({ submissionId: context.ship.id, programId: context.programId });
</script>

{#snippet directory(node: DirectoryNode)}
	<ul>
		{#each node.directories as child (child.path)}
			{@const open = !collapsed.has(child.path)}
			<li>
				<button
					type="button"
					class="row"
					title={child.path}
					aria-expanded={open}
					onclick={() => toggle(child.path)}
				>
					<span class={{ chevron: true, open }}><Icon name="chevD" size={11} /></span>
					<span class="glyph"><Icon name="folder" size={13} /></span>
					<span class="name">{child.name}</span>
					<span class="time folder">{formatDuration(child.seconds)}</span>
				</button>
				{#if open}{@render directory(child)}{/if}
			</li>
		{/each}
		{#each node.files as file (file.row.path)}
			<li>
				<button type="button" class="row leaf" title="View source" onclick={() => view(file.row)}>
					<span class="glyph"><Icon name="file" size={13} /></span>
					<span class="name">{file.name}</span>
					{#if file.row.bytes !== null}<span class="bytes">{formatBytes(file.row.bytes)}</span>{/if}
					<svg
						class="bar"
						viewBox="0 0 {busiestSeconds} 1"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<rect width={file.row.seconds} height="1" />
					</svg>
					<span class="time">{formatDuration(file.row.seconds)}</span>
				</button>
			</li>
		{/each}
	</ul>
{/snippet}

<EvidenceBody>
	{#if inRepository.length}
		<p class="summary">
			{inRepository.length} file{inRepository.length === 1 ? '' : 's'} ·
			{formatDuration(trackedSeconds)} tracked
		</p>
		<div class="tree">{@render directory(tree)}</div>
	{:else if !Extras || outside.length === 0}
		<EmptyState title="No per-file time" icon="folder">
			The capture did not record which files the time went to.
		</EmptyState>
	{/if}
	{#if Extras && outside.length}
		<Extras ship={shipRef} files={outside} />
	{/if}
</EvidenceBody>

<Dialog
	bind:open={viewerOpen}
	size="lg"
	icon="file"
	title={viewing?.path ?? 'File'}
	description={viewing
		? [
				`${formatDuration(viewing.seconds)} tracked`,
				viewing.bytes === null ? null : formatBytes(viewing.bytes)
			]
				.filter(Boolean)
				.join(' · ')
		: undefined}
>
	{#if loading}
		<Notice>Reading the file from the repository. The first open can take a few seconds.</Notice>
	{:else if source?.ok}
		{#if source.truncated}
			<Notice>Preview cut off: the file is larger than the viewer carries.</Notice>
		{/if}
		<div class="code">
			<pre class="lines" aria-hidden="true">{lineNumbers}</pre>
			<pre class="content">{source.content}</pre>
		</div>
	{:else}
		<Notice>{source?.message ?? failure ?? 'Could not load the file.'}</Notice>
	{/if}
	{#snippet footer()}
		{#if githubUrl && viewing}
			<Button
				size="sm"
				icon="github"
				href="{githubUrl}/blob/HEAD/{viewing.path}"
				target="_blank"
				rel="noreferrer noopener">Open on GitHub</Button
			>
		{/if}
		<Button size="sm" variant="quiet" data-autofocus onclick={() => (viewerOpen = false)}
			>Close</Button
		>
	{/snippet}
</Dialog>

<style>
	.summary {
		margin: 0;
		padding: var(--space-1) 0 var(--space-2);
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	ul {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	ul ul {
		padding-left: var(--space-4);
	}
	/* deep trees stop stepping in, so the names keep some width */
	ul ul ul ul ul ul {
		padding-left: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
	}
	.row:hover {
		background: var(--surface-2);
	}
	/* a file has no chevron: 11px of icon plus the row gap keeps it under its folder's name */
	.leaf {
		padding-left: calc(var(--space-1) + 11px + var(--space-2));
	}
	.chevron,
	.glyph {
		display: inline-flex;
		flex: none;
		color: var(--text-3);
	}
	.chevron {
		transform: rotate(-90deg);
		transition: transform 0.15s;
	}
	.chevron.open {
		transform: none;
	}
	.name {
		min-width: 0;
		overflow: hidden;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bytes {
		flex: none;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.bar {
		flex: 0 0 44px;
		height: 4px;
		margin-left: auto;
		border-radius: var(--radius-full);
		background: var(--surface-3);
		fill: var(--primary);
	}
	.time {
		flex: 0 0 72px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		text-align: right;
		white-space: nowrap;
	}
	.time.folder {
		margin-left: auto;
		color: var(--text-3);
		font-weight: 500;
	}
	.code {
		display: flex;
		min-height: 0;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.55;
	}
	.code pre {
		margin: 0;
		padding: var(--space-2) var(--space-3);
	}
	.lines {
		position: sticky;
		left: 0;
		flex: none;
		border-right: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-3);
		text-align: right;
		user-select: none;
	}
	.content {
		flex: 1;
		color: var(--text);
		tab-size: 4;
	}
	@container evidenceTile (max-width: 420px) {
		.bytes,
		.bar {
			display: none;
		}
		.leaf .time {
			margin-left: auto;
		}
	}
	@container evidenceTile (max-width: 340px) {
		ul ul {
			padding-left: var(--space-2);
		}
		.time {
			flex-basis: 60px;
		}
	}
</style>
