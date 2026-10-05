<script lang="ts">
	import OrganizerPicker from '../OrganizerPicker.svelte';
	import PocPicker from '../PocPicker.svelte';
	import type { BoardPerson } from '../boardTypes';
	import type { ProgramWizard } from '../programWizard.svelte';

	interface Props {
		wizard: ProgramWizard;
		people: BoardPerson[];
	}
	let { wizard, people }: Props = $props();
</script>

<OrganizerPicker {wizard} {people} />
<PocPicker {wizard} {people} />
