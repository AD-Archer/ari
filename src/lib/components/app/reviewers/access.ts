import { trackLabel, type ProgramPermission, type Track } from '$lib/data';

export interface AccessMember {
	userId: string | null;
	name: string;
	email: string;
	tracks: Track[];
	permissions: ProgramPermission[];
}

export const trackText = (tracks: Track[]) =>
	tracks.length ? tracks.map(trackLabel).join(', ') : 'No tracks';

export const toggled = <Value>(list: Value[], value: Value): Value[] =>
	list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
