<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import Notice from './Notice.svelte';
	import type { IconName } from './iconPaths';

	interface Props {
		open?: boolean;
		title: string;
		description?: string;
		icon?: IconName;
		tone?: 'default' | 'danger' | 'ok';
		size?: 'sm' | 'md' | 'lg';
		confirmLabel?: string;
		cancelLabel?: string;
		confirmIcon?: IconName;
		confirmDisabled?: boolean;
		busy?: boolean;
		initialFocus?: string;
		children?: Snippet;
		onConfirm: () => unknown;
		onCancel?: () => void;
	}
	let {
		open = $bindable(false),
		title,
		description,
		icon,
		tone = 'default',
		size = 'sm',
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		confirmIcon,
		confirmDisabled = false,
		busy = false,
		initialFocus,
		children,
		onConfirm,
		onCancel
	}: Props = $props();

	let pending = $state(false);
	let failure = $state('');
	const working = $derived(busy || pending);
	const confirmVariant = $derived(tone === 'danger' ? 'danger' : tone === 'ok' ? 'ok' : 'primary');

	// resolving to false keeps the dialog open, for actions that fail without throwing
	async function confirm() {
		if (working) return;
		pending = true;
		failure = '';
		try {
			const result = await onConfirm();
			if (result !== false) open = false;
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		} finally {
			pending = false;
		}
	}

	function dismissed() {
		failure = '';
		onCancel?.();
	}

	function cancel() {
		open = false;
		dismissed();
	}
</script>

<Dialog
	bind:open
	{title}
	{description}
	{icon}
	{tone}
	{size}
	{initialFocus}
	dismissible={!working}
	onClose={dismissed}
>
	{@render children?.()}
	{#if failure}<Notice tone="danger">{failure}</Notice>{/if}
	{#snippet footer()}
		<Button
			variant="quiet"
			disabled={working}
			data-autofocus={tone === 'danger' ? '' : undefined}
			onclick={cancel}
		>
			{cancelLabel}
		</Button>
		<Button
			variant={confirmVariant}
			icon={confirmIcon}
			loading={working}
			disabled={confirmDisabled}
			data-autofocus={tone === 'danger' ? undefined : ''}
			onclick={confirm}
		>
			{confirmLabel}
		</Button>
	{/snippet}
</Dialog>
