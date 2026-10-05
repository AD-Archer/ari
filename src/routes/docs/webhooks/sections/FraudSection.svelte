<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocSection from '$lib/components/docs/DocSection.svelte';
	import RowList from '$lib/components/docs/RowList.svelte';
	import { sampleFraud } from '../examples';
	import { fraudModes } from '../rows';
</script>

<DocSection id="fraud" title="Fraud review">
	<p class="docProse">
		Fraud review is an optional extra step you can turn on for your program. When it is on, ships
		get an extra fraud check and each maker gets their own result. On a shared ship everyone is
		checked on their own, and if even one person does not pass, the whole ship does not pass. It is
		off until you turn it on, and you choose how it works in
		<code>Settings → Fraud review</code>.
	</p>
	<p class="docProse">There are four ways to use it, and each one fits in at a different point.</p>
	<RowList rows={fraudModes} />
	<p class="docProse">
		So the only brand new event here is <code>review.fraud</code>, and you only ever get it with the
		relay option. The first three options reuse the same
		<code>review.rejected</code> you already handle, so there is nothing extra to build for them.
		Here is what a <code>review.fraud</code> delivery looks like.
	</p>
	<CodeBlock title="review.fraud" code={sampleFraud} />
</DocSection>
