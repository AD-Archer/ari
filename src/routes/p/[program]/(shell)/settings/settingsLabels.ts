import { trackLabels, type Track } from '$lib/data';

export const tracksLabel = (tracks: Track[]): string =>
	tracks.length === 2 ? 'Both tracks' : tracks.length === 1 ? trackLabels[tracks[0]] : 'Pick track';
