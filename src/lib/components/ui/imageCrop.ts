export interface CropSize {
	width: number;
	height: number;
}

export interface CropTransform {
	scale: number;
	offsetX: number;
	offsetY: number;
}

export const cropOutput = (mode: 'square' | 'wide'): CropSize =>
	mode === 'square' ? { width: 512, height: 512 } : { width: 1024, height: 576 }; // wide is 16:9

export const coverScale = (view: CropSize, natural: CropSize): number =>
	Math.max(view.width / natural.width, view.height / natural.height);

const clampAxis = (viewLength: number, scaledLength: number, offset: number): number =>
	scaledLength <= viewLength
		? (viewLength - scaledLength) / 2
		: Math.min(0, Math.max(viewLength - scaledLength, offset));

// the scaled image always covers the frame, so no empty edge is ever exported
export function clampTransform(
	view: CropSize,
	natural: CropSize,
	transform: CropTransform
): CropTransform {
	return {
		scale: transform.scale,
		offsetX: clampAxis(view.width, natural.width * transform.scale, transform.offsetX),
		offsetY: clampAxis(view.height, natural.height * transform.scale, transform.offsetY)
	};
}

export function centredTransform(view: CropSize, natural: CropSize): CropTransform {
	const scale = coverScale(view, natural);
	return clampTransform(view, natural, {
		scale,
		offsetX: (view.width - natural.width * scale) / 2,
		offsetY: (view.height - natural.height * scale) / 2
	});
}

// rescales about the frame centre so zooming does not jump
export function zoomTransform(
	view: CropSize,
	natural: CropSize,
	transform: CropTransform,
	scale: number
): CropTransform {
	const centreX = view.width / 2;
	const centreY = view.height / 2;
	const imageX = (centreX - transform.offsetX) / transform.scale;
	const imageY = (centreY - transform.offsetY) / transform.scale;
	return clampTransform(view, natural, {
		scale,
		offsetX: centreX - imageX * scale,
		offsetY: centreY - imageY * scale
	});
}

export function renderCrop(
	image: HTMLImageElement,
	view: CropSize,
	transform: CropTransform,
	output: CropSize
): Promise<Blob | null> {
	const canvas = document.createElement('canvas');
	canvas.width = output.width;
	canvas.height = output.height;
	const context = canvas.getContext('2d');
	if (!context) return Promise.resolve(null);
	// the output has the frame's aspect, so one ratio maps the on-screen transform onto the canvas
	const ratio = output.width / view.width;
	context.imageSmoothingQuality = 'high';
	context.drawImage(
		image,
		transform.offsetX * ratio,
		transform.offsetY * ratio,
		image.naturalWidth * transform.scale * ratio,
		image.naturalHeight * transform.scale * ratio
	);
	return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
