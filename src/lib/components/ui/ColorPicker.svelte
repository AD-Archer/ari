<script lang="ts">
	import Swatch from './Swatch.svelte';

	interface Props {
		label: string;
		name: string;
		value?: string;
		colors: string[];
		disabled?: boolean;
	}
	let { label, name, value = $bindable(''), colors, disabled = false }: Props = $props();
</script>

<fieldset class="colorPicker" {disabled}>
	<legend>{label}</legend>
	<div class="options">
		{#each colors as color (color)}
			<label class="option" title={color}>
				<input type="radio" {name} value={color} aria-label={color} bind:group={value} />
				<span class="chip"><Swatch {color} /></span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.colorPicker {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	legend {
		margin-bottom: var(--space-1);
		padding: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-2);
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-md);
	}
	.option {
		position: relative;
		display: grid;
		cursor: pointer;
	}
	.colorPicker:disabled .option {
		opacity: 0.5;
		cursor: default;
	}
	input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: inherit;
	}
	.chip {
		display: grid;
		padding: 3px;
		border: 2px solid transparent;
		border-radius: var(--radius-md);
		transition: border-color 0.12s;
	}
	.option:hover .chip {
		border-color: var(--border-2);
	}
	input:checked + .chip {
		border-color: var(--text);
	}
	input:focus-visible + .chip {
		box-shadow: 0 0 0 4px var(--ring);
	}
</style>
