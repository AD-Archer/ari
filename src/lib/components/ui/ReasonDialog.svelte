<script lang="ts">
	import type { Snippet } from 'svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Textarea from './Textarea.svelte';
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
		busy?: boolean;
		reason?: string;
		reasonLabel?: string;
		placeholder?: string;
		hint?: string;
		required?: boolean;
		minLength?: number;
		maxLength?: number;
		rows?: number;
		children?: Snippet;
		onConfirm: (reason: string) => unknown;
		onCancel?: () => void;
	}
	let {
		open = $bindable(false),
		title,
		description,
		icon,
		tone = 'default',
		size = 'md',
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		confirmIcon,
		busy = false,
		reason = $bindable(''),
		reasonLabel = 'Reason',
		placeholder,
		hint,
		required = true,
		minLength = 0,
		maxLength,
		rows = 3,
		children,
		onConfirm,
		onCancel
	}: Props = $props();

	const uid = $props.id();
	const trimmed = $derived(reason.trim());
	const valid = $derived(
		trimmed.length === 0
			? !required
			: trimmed.length >= minLength && (!maxLength || trimmed.length <= maxLength)
	);

	async function confirm() {
		const result = await onConfirm(trimmed);
		if (result !== false) reason = '';
		return result;
	}
</script>

<ConfirmDialog
	bind:open
	{title}
	{description}
	{icon}
	{tone}
	{size}
	{confirmLabel}
	{cancelLabel}
	{confirmIcon}
	{busy}
	confirmDisabled={!valid}
	initialFocus="textarea"
	onConfirm={confirm}
	{onCancel}
>
	{@render children?.()}
	<Textarea
		id="{uid}-reason"
		name="reason"
		label={required ? reasonLabel : `${reasonLabel} (optional)`}
		{placeholder}
		{hint}
		{rows}
		{required}
		minlength={minLength || undefined}
		maxlength={maxLength}
		counter={minLength > 0}
		countLength={(text) => text.trim().length}
		disabled={busy}
		bind:value={reason}
	/>
</ConfirmDialog>
