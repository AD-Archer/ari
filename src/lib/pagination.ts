export const tablePageSize = (): number => 24; // rows per table page

export function pageWindow(current: number, total: number, around = 1, edge = 1): (number | '…')[] {
	if (total <= 1) return [0];

	const keep = new Set<number>();
	for (let offset = 0; offset < edge; offset++) {
		keep.add(offset);
		keep.add(total - 1 - offset);
	}
	for (let page = current - around; page <= current + around; page++) keep.add(page);

	const sorted = [...keep]
		.filter((page) => page >= 0 && page < total)
		.sort((first, second) => first - second);

	const pages: (number | '…')[] = [];
	let previous = -1;
	for (const page of sorted) {
		if (previous !== -1) {
			// a gap of exactly one page shows that page: an ellipsis would hide it for no saving
			if (page - previous === 2) pages.push(previous + 1);
			else if (page - previous > 1) pages.push('…');
		}
		pages.push(page);
		previous = page;
	}
	return pages;
}

export const pageCountFor = (total: number, pageSize: number): number =>
	Math.max(1, Math.ceil(total / pageSize));

export function pageRange(
	page: number,
	pageSize: number,
	total: number
): { first: number; last: number } {
	if (total <= 0) return { first: 0, last: 0 };
	return { first: page * pageSize + 1, last: Math.min((page + 1) * pageSize, total) };
}
