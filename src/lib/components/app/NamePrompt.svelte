<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, Dialog, TextField } from '$lib/components/ui';

	// blocking on purpose: the stand-in would be a raw email, and the legal name is never used
	let open = $state(true);
	let name = $state('');
	let saving = $state(false);
	let errorMessage = $state<string | null>(null);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed || saving) return;
		saving = true;
		errorMessage = null;
		try {
			const response = await fetch(resolve('/profile/name'), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: trimmed })
			});
			// 409 means another tab already answered, so the prompt is done either way
			if (!response.ok && response.status !== 409) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? `Saving failed (${response.status})`);
			}
			open = false;
			await invalidateAll();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Saving failed. Try again';
		} finally {
			saving = false;
		}
	}
</script>

<Dialog
	bind:open
	title="What should we call you?"
	description="We couldn't pull your display name from Slack, so pick the name other reviewers will see. Once we can reach your Slack profile again, we'll switch to that display name."
	icon="user"
	size="sm"
	dismissible={false}
>
	<form id="namePromptForm" onsubmit={save}>
		<TextField
			label="Preferred name"
			name="preferredName"
			placeholder="e.g. Orpheus"
			autocomplete="nickname"
			maxlength={80}
			error={errorMessage}
			data-autofocus
			bind:value={name}
		/>
	</form>
	{#snippet footer()}
		<Button
			variant="primary"
			type="submit"
			form="namePromptForm"
			disabled={!name.trim()}
			loading={saving}
		>
			Save name
		</Button>
	{/snippet}
</Dialog>
