<script lang="ts">
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import {
		Avatar,
		Badge,
		Button,
		Card,
		ConfirmDialog,
		DataTable,
		Dialog,
		Dropdown,
		EmptyState,
		Icon,
		KeyValue,
		type DataTableColumn,
		type DropdownItem
	} from '$lib/components/ui';
	import { copyText, submitAction } from '$lib/actions';
	import { toast } from '$lib/toast.svelte';
	import MintDialog from './components/MintDialog.svelte';
	import type { PageData } from './$types';

	type Token = PageData['tokens'][number];

	let { data }: { data: PageData } = $props();

	const connectCommand = $derived(
		`claude mcp add ari --transport http ${data.endpoint} \\\n  --header "Authorization: Bearer YOUR_TOKEN"`
	);
	const connectItems = $derived([
		{ key: 'Endpoint', value: data.endpoint, mono: true, copy: true },
		{ key: 'Claude Code', value: connectCommand, mono: true, copy: true }
	]);

	const columns: DataTableColumn[] = [
		{ key: 'label', label: 'Label', width: '1.8fr' },
		{ key: 'owner', label: 'Owner', width: '1.4fr', hideBelow: 'md' },
		{ key: 'state', label: 'Status', width: '110px' },
		{ key: 'lastUsed', label: 'Last used', width: '100px', hideBelow: 'sm' },
		{ key: 'expires', label: 'Expires', width: '110px', hideBelow: 'sm' }
	];

	const agoLabel = (span: string) => (span === 'now' ? 'just now' : `${span} ago`);

	let mintOpen = $state(false);
	// the raw token lives here only while the reveal dialog is open
	let revealed = $state<{ token: string; label: string } | null>(null);
	let revealOpen = $state(false);
	let revokeOpen = $state(false);
	let revokeTarget = $state<Token | null>(null);

	function closeReveal() {
		revealOpen = false;
		revealed = null;
	}

	async function revoke() {
		if (!revokeTarget) return;
		const target = revokeTarget;
		const result = await submitAction('revoke', { id: target.id });
		if (!result.ok) throw new Error(result.message);
		toast.success(`Token "${target.label}" revoked`, { icon: 'lock' });
	}

	async function remove(token: Token) {
		const result = await submitAction('delete', { id: token.id }, { errorToast: true });
		if (result.ok) toast.success(`Token "${token.label}" deleted`, { icon: 'x' });
	}

	function menuFor(token: Token): DropdownItem[] {
		if (token.state === 'active')
			return [
				{
					label: 'Revoke',
					icon: 'lock',
					tone: 'danger',
					onSelect: () => {
						revokeTarget = token;
						revokeOpen = true;
					}
				}
			];
		return [{ label: 'Delete', icon: 'x', tone: 'danger', onSelect: () => remove(token) }];
	}
</script>

<svelte:head><title>MCP · Admin · Ari</title></svelte:head>

<PageHeader
	title="MCP access"
	description="Bearer tokens for the org MCP server. Each token acts as you and only works while you hold Manage MCP and Operate all programs."
>
	{#snippet actions()}
		<Button variant="primary" icon="plus" onclick={() => (mintOpen = true)}>New token</Button>
	{/snippet}
</PageHeader>

<Card>
	<div class="connect">
		<h2>Connect a client</h2>
		<KeyValue items={connectItems}>
			{#snippet value(item)}<code>{item.value}</code>{/snippet}
		</KeyValue>
	</div>
</Card>

<Card padded={false}>
	<DataTable label="MCP tokens" {columns} rows={data.tokens} rowKey={(token) => token.id} flush>
		{#snippet cell({ row, column })}
			{#if column.key === 'label'}
				<div class="token">
					<span class="name">
						{row.label}
						<Badge>{row.canWrite ? 'read-write' : 'read-only'}</Badge>
					</span>
					<span class="meta mono">…{row.last4} · created {agoLabel(row.created)}</span>
				</div>
			{:else if column.key === 'owner'}
				<Avatar name={row.owner} color={row.ownerColor} size="sm" decorative />
				<span class="meta truncate">{row.ownerEmail}</span>
			{:else if column.key === 'state'}
				{#if row.state === 'active'}
					<Badge tone="approved"><Icon name="check" size={12} /> Active</Badge>
				{:else if row.state === 'expired'}
					<Badge tone="pending"><Icon name="clock" size={12} /> Expired</Badge>
				{:else}
					<Badge tone="rejected"><Icon name="lock" size={12} /> Revoked</Badge>
				{/if}
			{:else if column.key === 'lastUsed'}
				<span class="meta">{row.lastUsed ? agoLabel(row.lastUsed) : 'never'}</span>
			{:else}
				<span class="meta">{row.expires ?? 'never'}</span>
			{/if}
		{/snippet}
		{#snippet rowActions(row)}
			<Dropdown items={menuFor(row)} align="end">
				{#snippet trigger(triggerProps)}
					<Button
						variant="quiet"
						size="sm"
						icon="dots"
						aria-label={`Actions for ${row.label}`}
						{...triggerProps}
					/>
				{/snippet}
			</Dropdown>
		{/snippet}
		{#snippet empty()}
			<EmptyState title="No tokens yet" icon="lock">
				Create one to connect an MCP client.
			</EmptyState>
		{/snippet}
	</DataTable>
</Card>

<MintDialog
	bind:open={mintOpen}
	ownerEmail={data.user?.email ?? ''}
	onMinted={(minted) => {
		revealed = minted;
		revealOpen = true;
	}}
/>

<Dialog
	bind:open={revealOpen}
	title="Token created"
	description={`“${revealed?.label ?? ''}” is shown only this once. Store it now.`}
	icon="check"
	tone="ok"
	dismissible={false}
>
	<code class="secret">{revealed?.token ?? ''}</code>
	{#snippet footer()}
		<Button variant="quiet" onclick={closeReveal}>Done</Button>
		<Button
			variant="primary"
			icon="clip"
			data-autofocus
			onclick={() => revealed && copyText(revealed.token, 'Token copied')}
		>
			Copy token
		</Button>
	{/snippet}
</Dialog>

<ConfirmDialog
	bind:open={revokeOpen}
	title="Revoke token?"
	icon="lock"
	tone="danger"
	confirmLabel="Revoke"
	onConfirm={revoke}
>
	<p class="confirm">
		“{revokeTarget?.label}” stops working on its next request. This cannot be undone.
	</p>
</ConfirmDialog>

<style>
	.confirm {
		margin: 0;
		color: var(--text-2);
	}
	.connect {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 700;
	}
	code {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		white-space: pre-wrap;
		word-break: break-all;
	}
	.secret {
		display: block;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		user-select: all;
	}
	.token {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		font-weight: 700;
	}
	.meta {
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
