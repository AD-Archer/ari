export const clampIndex = (index: number, length: number): number =>
	Math.min(Math.max(Math.trunc(index), 0), Math.max(length - 1, 0));

export function moveItem<Item>(items: readonly Item[], from: number, to: number): Item[] {
	const next = [...items];
	if (from < 0 || from >= next.length || !Number.isInteger(from)) return next;
	const target = clampIndex(to, next.length);
	if (target === from) return next;
	const [moved] = next.splice(from, 1);
	next.splice(target, 0, moved);
	return next;
}

export function dropIndex(
	centre: number,
	current: number,
	slots: readonly { top: number; height: number }[]
): number {
	let target = current;
	for (let index = 0; index < slots.length; index++) {
		const middle = slots[index].top + slots[index].height / 2;
		if (index < current && centre < middle) return index;
		if (index > current && centre > middle) target = index;
	}
	return target;
}
