<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocSection from '$lib/components/docs/DocSection.svelte';
	import FieldTable from '$lib/components/docs/FieldTable.svelte';
	import Note from '$lib/components/docs/Note.svelte';
	import { sampleInCollab, sampleInProgramSeconds } from '../examples';
	import { inboundFields } from '../inboundFields';
</script>

<DocSection id="fields" title="Payload fields">
	<p class="docProse">
		Every field Ari reads from a ship. Required ones are marked. Ari ignores anything it does not
		recognize, so extra fields are safe to send.
	</p>
	<p class="docProse">
		Ari keeps time in whole seconds. Wherever a length can be sent, the seconds field (<code
			>program_seconds</code
		>, <code>journals[].seconds</code>) is the exact one and wins when several are present. The
		minutes and hours fields keep working exactly as before and are stored as minutes × 60 seconds.
	</p>
	<FieldTable fields={inboundFields} />
	<CodeBlock title="ship.json (program-added time only)" code={sampleInProgramSeconds} />
</DocSection>

<DocSection id="collaborative" title="Collaborative ships">
	<p class="docProse">
		Some programs let more than one person share a ship. To use it, send a
		<code>collaborators</code> array with everyone who worked on the project, up to 10 people. They
		become the ship's makers: each one shows up in the queue with their own verified time, while
		<code>maker</code> stays whoever submitted it. Every collaborator needs an
		<code>email</code>, you cannot list the same one twice, and an empty array just means a solo
		ship. Once you send collaborators, every
		<code>journals</code> entry also needs an
		<code>email</code> that matches one of them. If the program does not have this turned on,
		sending collaborators returns 422
		<code>collaborators_not_enabled</code>.
	</p>
	<Note>
		<p>
			Once Ari has gathered the evidence, anyone with zero verified minutes (Hackatime, journals,
			and lapse combined) makes the whole ship auto-reject. Everyone on a shared ship needs at least
			some verified time.
		</p>
	</Note>
	<CodeBlock title="ship.json (collaborative)" code={sampleInCollab} />
</DocSection>
