<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import Icon from './Icon.svelte';
	import {
		centredTransform,
		clampTransform,
		coverScale,
		cropOutput,
		renderCrop,
		zoomTransform,
		type CropTransform
	} from './imageCrop';

	interface Props {
		open?: boolean;
		image: HTMLImageElement | null;
		mode: 'square' | 'wide';
		label: string;
		onApply: (blob: Blob) => Promise<boolean>;
		onClose: () => void;
	}
	let { open = $bindable(false), image, mode, label, onApply, onClose }: Props = $props();

	const uid = $props.id();
	let viewWidth = $state(0);
	let viewHeight = $state(0);
	let transform = $state<CropTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
	let zoom = $state(1);
	let working = $state(false);
	let failure = $state('');
	let framedImage: HTMLImageElement | null = null;

	const view = $derived({ width: viewWidth, height: viewHeight });
	const natural = $derived({ width: image?.naturalWidth ?? 1, height: image?.naturalHeight ?? 1 });

	$effect(() => {
		if (!image || !viewWidth || !viewHeight || framedImage === image) return;
		framedImage = image;
		transform = centredTransform(view, natural);
		zoom = 1;
		failure = '';
	});

	function setZoom(next: number) {
		zoom = Math.min(4, Math.max(1, next)); // up to 4x the cover scale
		transform = zoomTransform(view, natural, transform, coverScale(view, natural) * zoom);
	}

	function moveBy(deltaX: number, deltaY: number) {
		transform = clampTransform(view, natural, {
			scale: transform.scale,
			offsetX: transform.offsetX + deltaX,
			offsetY: transform.offsetY + deltaY
		});
	}

	let dragging = false;
	let lastX = 0;
	let lastY = 0;

	function onPointerDown(event: PointerEvent) {
		dragging = true;
		lastX = event.clientX;
		lastY = event.clientY;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		moveBy(event.clientX - lastX, event.clientY - lastY);
		lastX = event.clientX;
		lastY = event.clientY;
	}

	function onPointerUp(event: PointerEvent) {
		dragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
	}

	function onWheel(event: WheelEvent) {
		event.preventDefault();
		setZoom(zoom - event.deltaY * 0.0015); // about 0.15x per wheel notch of 100px
	}

	function onKeydown(event: KeyboardEvent) {
		// 16px per key press, 0.1x zoom per plus or minus
		const steps: Record<string, [number, number]> = {
			ArrowLeft: [16, 0],
			ArrowRight: [-16, 0],
			ArrowUp: [0, 16],
			ArrowDown: [0, -16]
		};
		if (event.key === '+' || event.key === '=') setZoom(zoom + 0.1);
		else if (event.key === '-') setZoom(zoom - 0.1);
		else if (event.key in steps) moveBy(...steps[event.key]);
		else return;
		event.preventDefault();
	}

	function close() {
		if (working) return;
		open = false;
		framedImage = null;
		onClose();
	}

	async function apply() {
		if (!image || working) return;
		working = true;
		failure = '';
		const blob = await renderCrop(image, view, transform, cropOutput(mode));
		if (!blob) failure = 'Could not process the image.';
		const applied = blob ? await onApply(blob) : false;
		working = false;
		if (!applied) return;
		open = false;
		framedImage = null;
		onClose();
	}
</script>

<Dialog
	bind:open
	title={`Crop ${label}`}
	description="Drag or use the arrow keys to reposition. Scroll or use the slider to zoom."
	icon="crop"
	dismissible={!working}
	onClose={close}
>
	<div class="cropper">
		<!-- a real button: it takes focus, pointer drags and the arrow and zoom keys without borrowed roles -->
		<button
			type="button"
			class={['stage', mode]}
			aria-label={`Position the ${label}`}
			aria-describedby="{uid}-keys"
			data-autofocus
			bind:clientWidth={viewWidth}
			bind:clientHeight={viewHeight}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onwheel={onWheel}
			onkeydown={onKeydown}
		>
			{#if image}
				<!-- eslint-disable svelte/no-inline-styles -- the image follows the pointer and the zoom -->
				<img
					src={image.src}
					alt=""
					draggable="false"
					style:transform={`translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`}
				/>
				<!-- eslint-enable svelte/no-inline-styles -->
			{/if}
			<span class="guide"></span>
		</button>
		<span class="keys" id="{uid}-keys">Arrow keys move the image. Plus and minus zoom.</span>
		<label class="zoom">
			<Icon name="image" size={14} />
			<input
				type="range"
				min="1"
				max="4"
				step="0.01"
				value={zoom}
				aria-label="Zoom"
				oninput={(event) => setZoom(Number(event.currentTarget.value))}
			/>
			<Icon name="image" size={20} />
		</label>
		{#if failure}<p class="failure" role="alert">{failure}</p>{/if}
	</div>
	{#snippet footer()}
		<Button variant="quiet" disabled={working} onclick={close}>Cancel</Button>
		<Button variant="primary" icon="check" loading={working} onclick={apply}>Use image</Button>
	{/snippet}
</Dialog>

<style>
	.cropper {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
	}
	.stage {
		position: relative;
		display: block;
		overflow: hidden;
		padding: 0;
		border: 0;
		border-radius: var(--radius-lg);
		background: var(--surface-3);
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.stage:active {
		cursor: grabbing;
	}
	.stage:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	.square {
		width: min(100%, 300px);
		aspect-ratio: 1;
	}
	.wide {
		width: min(100%, 360px);
		aspect-ratio: 16 / 9;
	}
	img {
		position: absolute;
		top: 0;
		left: 0;
		max-width: none;
		transform-origin: 0 0;
		pointer-events: none;
	}
	.guide {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		/* rule of thirds */
		background-image:
			linear-gradient(color-mix(in srgb, var(--on-primary) 22%, transparent) 1px, transparent 1px),
			linear-gradient(
				90deg,
				color-mix(in srgb, var(--on-primary) 22%, transparent) 1px,
				transparent 1px
			);
		background-size: 33.333% 33.333%;
		background-position: center;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--on-primary) 18%, transparent);
	}
	.keys {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.zoom {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: min(100%, 300px);
		color: var(--text-3);
	}
	input {
		flex: 1;
		accent-color: var(--primary);
		cursor: pointer;
	}
	.failure {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--accent-red);
	}
</style>
