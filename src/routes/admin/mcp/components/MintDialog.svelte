<script lang="ts">
	import { Button, Dialog, Select, TextField, Toggle } from '$lib/components/ui';
	import { submitAction } from '$lib/actions';

	interface Props {
		open?: boolean;
		ownerEmail: string;
		onMinted: (minted: { token: string; label: string }) => void;
	}
	let { open = $bindable(false), ownerEmail, onMinted }: Props = $props();

	let label = $state('');
	let days = $state('');
	let canWrite = $state(false);
	let minting = $state(false);

	async function mint() {
		if (minting) return;
		minting = true;
		const result = await submitAction<{ token: string; label: string }>(
			'mint',
			{ label: label.trim(), days, canWrite: canWrite ? 'on' : null },
			{ errorToast: true, fallbackMessage: 'Could not mint token' }
		);
		minting = false;
		if (!result.ok || !result.data?.token) return;
		open = false;
		label = '';
		days = '';
		canWrite = false;
		onMinted({ token: result.data.token, label: result.data.label });
	}
</script>

<Dialog
	bind:open
	title="New MCP token"
	description={`Acts as you (${ownerEmail}). Shown once, copy it right away.`}
	icon="lock"
>
	<div class="form">
		<TextField
			label="Label"
			name="label"
			placeholder="e.g. my laptop"
			data-autofocus
			bind:value={label}
			onkeydown={(event) => event.key === 'Enter' && mint()}
		/>
		<Select
			label="Expires"
			name="days"
			options={[
				{ value: '', label: 'Never' },
				{ value: '30', label: '30 days' },
				{ value: '90', label: '90 days' },
				{ value: '365', label: '1 year' }
			]}
			bind:value={days}
		/>
		<Toggle
			label="Read-write"
			description="Allow write tools: create and edit programs, settings, review tools, signing secrets and members, set org role, dismiss flags. Off means read-only."
			bind:checked={canWrite}
		/>
	</div>
	{#snippet footer()}
		<Button variant="quiet" disabled={minting} onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" icon="plus" loading={minting} onclick={mint}>Create token</Button>
	{/snippet}
</Dialog>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
</style>
