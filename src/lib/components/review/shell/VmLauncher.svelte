<script lang="ts">
	import { copyText, submitAction } from '$lib/actions';
	import { Button, Dropdown, Icon, type DropdownItem } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import { toast } from '$lib/toast.svelte';

	type VmType = 'linux' | 'windows' | 'android';

	const { context, claim } = useReview();

	const machine = $derived(context.data.vm);
	const actionUrl = $derived(`/p/${context.programId}/review/${context.ship.id}`);

	let busy = $state(false);
	// stays on screen after the toast is gone, until the next attempt or a dismissal
	let launchError = $state<string | null>(null);

	$effect(() => {
		void context.ship.id;
		launchError = null;
	});

	async function launch(type: VmType) {
		if (busy || !claim.guardLock()) return;
		busy = true;
		launchError = null;
		toast.info(`Launching ${type} VM, this can take a moment…`, { icon: 'clock' });
		const result = await submitAction('launchVm', { type }, { actionUrl });
		busy = false;
		if (result.ok) {
			toast.success(`${type} VM ready`);
			return;
		}
		launchError =
			result.status === 0 ? `Could not launch the ${type} VM (network error)` : result.message;
		toast.error(launchError);
	}

	async function stop() {
		if (busy) return;
		busy = true;
		const result = await submitAction(
			'stopVm',
			{},
			{ actionUrl, fallbackMessage: 'Could not stop VM' }
		);
		busy = false;
		if (result.ok) toast.info('VM deleted', { icon: 'x' });
		else toast.error(result.message);
	}

	const launchItems: DropdownItem[] = [
		{ label: 'Linux', icon: 'commit', onSelect: () => void launch('linux') },
		{ label: 'Windows', icon: 'external', onSelect: () => void launch('windows') },
		{ label: 'Android', icon: 'play', onSelect: () => void launch('android') }
	];

	const runningItems = $derived.by((): DropdownItem[] => {
		if (!machine) return [];
		const items: DropdownItem[] = [
			{
				label: 'Open in browser',
				icon: 'external',
				onSelect: () => window.open(machine.guacUrl, '_blank', 'noopener')
			}
		];
		if (machine.rdpUri) {
			// the endpoint answers with an attachment, so the browser saves it and stays here
			items.push({ label: 'Download RDP file', icon: 'file', href: `${actionUrl}/vm-rdp` });
			const password = machine.rdpPassword;
			if (password)
				items.push({
					label: 'Copy RDP password',
					icon: 'clip',
					onSelect: () => void copyText(password, 'RDP password copied')
				});
		}
		if (context.shipState.canManageVm)
			items.push({
				label: 'Delete VM',
				icon: 'x',
				tone: 'danger',
				disabled: busy,
				separatorBefore: true,
				onSelect: () => void stop()
			});
		return items;
	});
</script>

{#if context.data.vmEnabled}
	{#if machine}
		<Dropdown align="end" items={runningItems}>
			{#snippet trigger(triggerProps)}
				<Button
					size="sm"
					icon="play"
					iconAfter="chevD"
					title="{machine.type} VM · {machine.name} · launched {machine.ago}"
					data-review-vm="running"
					{...triggerProps}
				>
					<span class="wide">{machine.type} VM</span>
				</Button>
			{/snippet}
		</Dropdown>
	{:else if context.shipState.canLaunchVm}
		<Dropdown align="end" items={launchItems}>
			{#snippet trigger(triggerProps)}
				<Button
					size="sm"
					variant={launchError ? 'danger' : 'ghost'}
					icon={launchError ? 'flag' : 'play'}
					iconAfter="chevD"
					loading={busy}
					disabled={busy}
					title="Launch a throwaway VM to run this project"
					data-review-vm="launch"
					{...triggerProps}
				>
					<span class="wide">{busy ? 'Launching…' : launchError ? 'Retry VM' : 'Launch VM'}</span>
				</Button>
			{/snippet}
		</Dropdown>
	{/if}
	{#if launchError}
		<span class="failure" role="alert">
			<Icon name="flag" size={14} />
			<span class="message">{launchError}</span>
			<Button
				size="sm"
				variant="quiet"
				icon="x"
				aria-label="Dismiss"
				onclick={() => (launchError = null)}
			/>
		</span>
	{/if}
{/if}

<style>
	.failure {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		max-width: 280px;
		padding-left: var(--space-2);
		border: 1px solid color-mix(in srgb, var(--color-red) 40%, var(--border));
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--color-red) 10%, var(--surface));
		color: var(--color-red);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.message {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 700px) {
		.wide {
			display: none;
		}
	}
</style>
