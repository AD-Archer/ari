<script lang="ts">
	import CodeBlock from '$lib/components/docs/CodeBlock.svelte';
	import DocSection from '$lib/components/docs/DocSection.svelte';
	import Note from '$lib/components/docs/Note.svelte';
	import { callReply, connectCommand, curlCall } from '../examples';

	let { endpoint }: { endpoint: string } = $props();
</script>

<DocSection id="overview" title="Overview">
	<p class="docProse">
		Ari has an MCP server at <code>{endpoint}</code>. It reads programs, ships and reviews, and with
		a read-write token it can also set programs up: create one, change any of its settings, manage
		its organizers and review tools, upload its images, and issue its webhook signing secrets. Use
		it from an MCP client such as Claude Code, or from a script over plain HTTP.
	</p>
	<p class="docProse">
		Writes go through the same code as the settings pages, so the same checks apply and every change
		lands in the program's activity log under the token owner's name.
	</p>
</DocSection>

<DocSection id="connecting" title="Tokens and connecting">
	<p class="docProse">
		Create a token in <code>Admin → MCP</code>. Give it a label, pick when it expires (never, 30
		days, 90 days or 1 year), and switch on <code>Read-write</code> if it should be able to change
		anything. The token starts with <code>ari_mcp_</code> and is shown once, so copy it right away. Ari
		keeps only a hash.
	</p>
	<p class="docProse">
		A token acts as the person who created it. Its owner must hold both
		<code>MANAGE_MCP</code> and <code>OPERATE_ALL_PROGRAMS</code>, and Ari checks this on every
		request: taking either permission away stops all of that person's tokens at once. Revoke a
		single token from the same page.
	</p>
	<CodeBlock title="Claude Code" tone="green" code={connectCommand(endpoint)} />
	<p class="docProse">
		Without an MCP client, send JSON-RPC 2.0 as a POST with the token as a bearer header. Call
		<code>tools/list</code> to see what the token can use, and <code>tools/call</code> to run a
		tool. The tool's result comes back as JSON text inside <code>result.content</code>.
	</p>
	<CodeBlock title="cURL" code={curlCall(endpoint)} />
	<CodeBlock title="Reply" code={callReply} />
	<Note>
		<p>
			A read-only token does not see the write tools in <code>tools/list</code>, and calling one
			anyway fails with <code>This token is read-only.</code>
		</p>
	</Note>
</DocSection>
