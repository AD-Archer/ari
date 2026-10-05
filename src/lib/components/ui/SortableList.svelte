<script lang="ts" generics="Item">
	import { tick, type Snippet } from 'svelte';
	import { flip } from 'svelte/animate';
	import { prefersReducedMotion } from 'svelte/motion';
	import { clampIndex, dropIndex, moveItem } from '$lib/reorder';
	import Icon from './Icon.svelte';

	type Key = string | number;

	interface Props {
		items: Item[];
		itemKey: (item: Item) => Key;
		item: Snippet<[{ item: Item; index: number; dragHandle: Snippet; moveButtons: Snippet }]>;
		label: string;
		itemLabel?: (item: Item) => string;
		onReorder?: (items: Item[]) => void;
	}
	let {
		items = $bindable(),
		itemKey,
		item: renderItem,
		label,
		itemLabel,
		onReorder
	}: Props = $props();

	const hintId = $props.id();

	let listElement = $state<HTMLUListElement>();
	let liftedKey = $state<Key | null>(null);
	let draggingKey = $state<Key | null>(null);
	let dragOffset = $state(0);
	let announcement = $state('');

	let orderBefore: Item[] = [];
	let grabOffset = 0;
	let pointerY = 0;
	let scrollFrame = 0;
	let scroller: Element | null = null;
	let movingFocus = false;

	const indexOfKey = (key: Key) => items.findIndex((entry) => itemKey(entry) === key);
	const nameOf = (entry: Item) => itemLabel?.(entry) ?? 'item';
	const placeOf = (index: number) => `position ${index + 1} of ${items.length}`;

	function commit(entry: Item, verb: string) {
		const index = items.indexOf(entry);
		const changed = items.some((current, position) => current !== orderBefore[position]);
		announcement = `${nameOf(entry)} ${verb}, ${placeOf(index)}`;
		if (changed) onReorder?.(items);
	}

	function scrollParent(node: HTMLElement): Element {
		for (let parent = node.parentElement; parent; parent = parent.parentElement) {
			const overflow = getComputedStyle(parent).overflowY;
			const scrolls = overflow === 'auto' || overflow === 'scroll';
			if (scrolls && parent.scrollHeight > parent.clientHeight) return parent;
		}
		return document.scrollingElement ?? document.documentElement;
	}

	function startDrag(event: PointerEvent, key: Key) {
		const index = indexOfKey(key);
		const row = listElement?.children[index];
		if (event.button !== 0 || !listElement || !row) return;
		orderBefore = items;
		liftedKey = null;
		draggingKey = key;
		dragOffset = 0;
		pointerY = event.clientY;
		grabOffset = event.clientY - row.getBoundingClientRect().top;
		scroller = scrollParent(listElement);
		scrollFrame = requestAnimationFrame(autoScroll);
	}

	function trackPointer() {
		if (draggingKey === null || !listElement) return;
		const index = indexOfKey(draggingKey);
		// offsetTop ignores the flip transforms still running on rows, so slots are their resting places
		const slots = ([...listElement.children] as HTMLElement[]).map((row) => ({
			top: row.offsetTop,
			height: row.offsetHeight
		}));
		const own = slots[index];
		if (!own) return;
		const listTop = listElement.getBoundingClientRect().top + listElement.clientTop;
		const floatTop = Math.min(
			Math.max(pointerY - grabOffset - listTop, 0),
			listElement.clientHeight - own.height
		);
		const target = dropIndex(floatTop + own.height / 2, index, slots);
		let restingTop = own.top;
		if (target > index) restingTop = slots[target].top + slots[target].height - own.height;
		if (target < index) restingTop = slots[target].top;
		if (target !== index) items = moveItem(items, index, target);
		dragOffset = floatTop - restingTop;
	}

	function autoScroll() {
		if (draggingKey === null || !scroller) return;
		const bounds =
			scroller === document.scrollingElement
				? { top: 0, bottom: window.innerHeight }
				: scroller.getBoundingClientRect();
		// within 48px of an edge the list scrolls, a third of the overshoot per frame, at most 14px
		const above = bounds.top + 48 - pointerY;
		const below = pointerY - (bounds.bottom - 48);
		const stepSize = above > 0 ? -Math.min(14, above / 3) : below > 0 ? Math.min(14, below / 3) : 0;
		if (stepSize) {
			scroller.scrollBy(0, stepSize);
			trackPointer();
		}
		scrollFrame = requestAnimationFrame(autoScroll);
	}

	function moveDrag(event: PointerEvent) {
		if (draggingKey === null) return;
		pointerY = event.clientY;
		trackPointer();
	}

	function endDrag(keep: boolean) {
		if (draggingKey === null) return;
		const entry = items[indexOfKey(draggingKey)];
		cancelAnimationFrame(scrollFrame);
		draggingKey = null;
		dragOffset = 0;
		if (!keep) {
			items = orderBefore;
			announcement = `Reorder cancelled, ${nameOf(entry)} returned to ${placeOf(items.indexOf(entry))}`;
			return;
		}
		commit(entry, 'dropped');
	}

	async function refocus(index: number, part: string) {
		movingFocus = true;
		await tick();
		const row = listElement?.children[index];
		const wanted = row?.querySelector<HTMLButtonElement>(`[data-reorder="${part}"]:not(:disabled)`);
		(wanted ?? row?.querySelector<HTMLButtonElement>('[data-reorder]:not(:disabled)'))?.focus();
		movingFocus = false;
	}

	function drop(keep: boolean) {
		if (liftedKey === null) return;
		const entry = items[indexOfKey(liftedKey)];
		liftedKey = null;
		if (keep) return commit(entry, 'dropped');
		items = orderBefore;
		announcement = `Reorder cancelled, ${nameOf(entry)} returned to ${placeOf(items.indexOf(entry))}`;
		refocus(items.indexOf(entry), 'handle');
	}

	function handleKey(event: KeyboardEvent, key: Key) {
		const index = indexOfKey(key);
		const toggles = event.key === ' ' || event.key === 'Enter';
		if (liftedKey !== key) {
			if (!toggles) return;
			event.preventDefault();
			orderBefore = items;
			liftedKey = key;
			announcement = `${nameOf(items[index])} lifted, ${placeOf(index)}. Use the arrow keys to move, space to drop, escape to cancel.`;
			return;
		}
		const targets: Record<string, number> = {
			ArrowUp: index - 1,
			ArrowDown: index + 1,
			Home: 0,
			End: items.length - 1
		};
		if (toggles) drop(true);
		else if (event.key === 'Escape') drop(false);
		else if (event.key in targets) {
			const target = clampIndex(targets[event.key], items.length);
			if (target !== index) {
				items = moveItem(items, index, target);
				announcement = `${nameOf(items[target])} moved to ${placeOf(target)}`;
				refocus(target, 'handle');
			}
		} else return;
		event.preventDefault();
	}

	function nudge(key: Key, delta: number, part: string) {
		const index = indexOfKey(key);
		const target = clampIndex(index + delta, items.length);
		if (target === index) return;
		orderBefore = items;
		items = moveItem(items, index, target);
		commit(items[target], 'moved');
		refocus(target, part);
	}

	function cancelOnEscape(event: KeyboardEvent) {
		if (event.key === 'Escape' && draggingKey !== null) endDrag(false);
	}
</script>

<!-- the drag listens on the window: reordering moves the handle in the dom, which would drop a pointer capture -->
<svelte:window
	onkeydown={cancelOnEscape}
	onpointermove={moveDrag}
	onpointerup={() => endDrag(true)}
	onpointercancel={() => endDrag(false)}
/>

<ul
	class={['sortableList', draggingKey !== null && 'active']}
	aria-label={label}
	bind:this={listElement}
>
	{#each items as entry, index (itemKey(entry))}
		<li
			class={{ dragging: draggingKey === itemKey(entry), lifted: liftedKey === itemKey(entry) }}
			animate:flip={{
				// the dragged row must not animate or it would lag behind the pointer
				duration: draggingKey === itemKey(entry) || prefersReducedMotion.current ? 0 : 150
			}}
		>
			<!-- eslint-disable svelte/no-inline-styles -- the one place the dragged row follows the pointer -->
			<div
				class="body"
				style:transform={draggingKey === itemKey(entry) ? `translateY(${dragOffset}px)` : null}
			>
				<!-- eslint-enable svelte/no-inline-styles -->
				{#snippet dragHandle()}
					<button
						type="button"
						class={['handle', draggingKey === itemKey(entry) && 'grabbing']}
						data-reorder="handle"
						aria-label={`Reorder ${nameOf(entry)}`}
						aria-pressed={liftedKey === itemKey(entry)}
						aria-describedby={hintId}
						onpointerdown={(event) => startDrag(event, itemKey(entry))}
						onkeydown={(event) => handleKey(event, itemKey(entry))}
						onblur={() => {
							// moving a focused row in the dom blurs it; only a real blur drops the item
							if (!movingFocus && liftedKey === itemKey(entry)) drop(true);
						}}
					>
						<Icon name="sort" size={15} />
					</button>
				{/snippet}
				{#snippet moveButtons()}
					<span class="moveButtons">
						<button
							type="button"
							class="move up"
							data-reorder="up"
							aria-label={`Move ${nameOf(entry)} up`}
							disabled={index === 0}
							onclick={() => nudge(itemKey(entry), -1, 'up')}
						>
							<Icon name="chevD" size={14} />
						</button>
						<button
							type="button"
							class="move"
							data-reorder="down"
							aria-label={`Move ${nameOf(entry)} down`}
							disabled={index === items.length - 1}
							onclick={() => nudge(itemKey(entry), 1, 'down')}
						>
							<Icon name="chevD" size={14} />
						</button>
					</span>
				{/snippet}
				{@render renderItem({ item: entry, index, dragHandle, moveButtons })}
			</div>
		</li>
	{/each}
</ul>
<p class="visuallyHidden" id={hintId}>
	Press space to lift, the arrow keys to move, space to drop, escape to cancel.
</p>
<div class="visuallyHidden" aria-live="assertive" aria-atomic="true">{announcement}</div>

<style>
	.sortableList {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.active {
		user-select: none;
	}
	li {
		border-radius: var(--radius-md);
	}
	.body {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}
	.dragging {
		outline: 2px dashed var(--border-2);
		outline-offset: -2px;
		background: var(--surface-2);
	}
	.dragging .body {
		position: relative;
		z-index: var(--layer-sticky);
		box-shadow: var(--shadow-lg);
		cursor: grabbing;
	}
	.lifted .body {
		border-color: var(--primary);
		box-shadow: var(--shadow);
	}
	.handle,
	.move {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: var(--control-sm);
		height: var(--control-sm);
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-3);
		cursor: pointer;
	}
	.handle {
		cursor: grab;
		touch-action: none;
	}
	.grabbing {
		cursor: grabbing;
	}
	.handle:hover,
	.move:hover:not(:disabled),
	.handle[aria-pressed='true'] {
		background: var(--surface-3);
		color: var(--text);
	}
	.move:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.moveButtons {
		display: inline-flex;
		flex: none;
	}
	.up {
		transform: rotate(180deg);
	}
	.visuallyHidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
