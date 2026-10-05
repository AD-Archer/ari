import { allTracks, type Track } from '$lib/data';

export type FieldType = 'checkbox' | 'text' | 'number' | 'select' | 'multiselect';

export const fieldTypes: { value: FieldType; label: string }[] = [
	{ value: 'checkbox', label: 'Checkbox' },
	{ value: 'text', label: 'Short text' },
	{ value: 'number', label: 'Number' },
	{ value: 'select', label: 'Dropdown' },
	{ value: 'multiselect', label: 'Multi-select' }
];

export const fieldTypeLabel = (type: FieldType): string =>
	fieldTypes.find((entry) => entry.value === type)?.label ?? type;

export const hasOptions = (type: FieldType): boolean => type === 'select' || type === 'multiselect';

export const settingsTabs = ['general', 'intake', 'review', 'tools', 'webhooks'] as const;
export type SettingsTab = (typeof settingsTabs)[number];

export const evidenceKinds = ['commits', 'elapsed', 'devlog'] as const;

export interface SettingsValues {
	displayName: string;
	iconUrl: string;
	cardBgUrl: string;
	trackingStartsAt: string;
	accepts: Record<(typeof evidenceKinds)[number], boolean>;
	collaborative: boolean;
	secondPass: boolean;
	secondPassApproved: boolean;
	secondPassChanges: boolean;
	secondPassRejected: boolean;
	secondPassOrganizerBypass: boolean;
	screenIdentity: boolean;
	screenHackatime: boolean;
	reviewersCannotReviewOwnProjects: boolean;
	allowDeflation: boolean;
	hoursJustification: boolean;
	reviewerReauth: boolean;
	reviewerReauthTtlMinutes: string;
	priorityReview: boolean;
	priorityReviewMessage: string;
	reviewGoal: string;
	reviewersChannel: string;
	outUrl: string;
	outEnabled: boolean;
}

export const settingsToggles = [
	'collaborative',
	'secondPass',
	'secondPassApproved',
	'secondPassChanges',
	'secondPassRejected',
	'secondPassOrganizerBypass',
	'screenIdentity',
	'screenHackatime',
	'reviewersCannotReviewOwnProjects',
	'allowDeflation',
	'hoursJustification',
	'reviewerReauth',
	'priorityReview',
	'outEnabled'
] as const satisfies readonly (keyof SettingsValues)[];

export const settingsTexts = [
	'displayName',
	'iconUrl',
	'cardBgUrl',
	'trackingStartsAt',
	'reviewerReauthTtlMinutes',
	'priorityReviewMessage',
	'reviewGoal',
	'reviewersChannel',
	'outUrl'
] as const satisfies readonly (keyof SettingsValues)[];

export interface ChecklistDraft {
	id: string;
	label: string;
	tracks: Track[];
}

export interface FieldDraft {
	id: string;
	type: FieldType;
	label: string;
	description: string | null;
	key: string;
	options: string[];
	required: boolean;
	tracks: Track[];
}

export interface SnippetDraft {
	id: string;
	name: string;
	body: string;
}

export interface ToolsDraft {
	checklist: ChecklistDraft[];
	fields: FieldDraft[];
	snippets: SnippetDraft[];
}

export const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

export const wholeNumberBetween = (raw: string, least: number, most: number): number | null => {
	const parsed = Number(raw.trim());
	return raw.trim() !== '' && Number.isInteger(parsed) && parsed >= least && parsed <= most
		? parsed
		: null;
};

// 100000 minutes is the longest inactivity window the reauth gate accepts
export const parseReauthTtl = (raw: string): number | null => wholeNumberBetween(raw, 1, 100000);
export const parseReviewGoal = (raw: string): number | null => wholeNumberBetween(raw, 1, 10000);

export const slugKey = (raw: string): string =>
	raw
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');

export const fieldKeyFor = (rawKey: string, label: string): string =>
	(rawKey.trim() ? slugKey(rawKey) : slugKey(label)) || 'field';

export const slugName = (raw: string): string =>
	raw
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40); // snippet triggers are capped at 40 characters

export const splitOptions = (raw: string): string[] =>
	raw
		.split(',')
		.map((option) => option.trim())
		.filter(Boolean);

export function validateSettings(values: SettingsValues): string | null {
	if (!values.displayName.trim()) return 'Display name is required.';
	if (values.iconUrl.trim() && !isHttpUrl(values.iconUrl.trim())) {
		return 'Icon URL must start with http:// or https://';
	}
	if (values.cardBgUrl.trim() && !isHttpUrl(values.cardBgUrl.trim())) {
		return 'Card background URL must start with http:// or https://';
	}
	if (values.reviewerReauth && parseReauthTtl(values.reviewerReauthTtlMinutes) === null) {
		return 'Reauth inactivity timeout must be a whole number of minutes between 1 and 100000.';
	}
	if (values.priorityReviewMessage.trim().length > 2000) {
		return 'The priority form message is too long (2000 max).';
	}
	if (parseReviewGoal(values.reviewGoal) === null) {
		return 'Weekly review goal must be a whole number between 1 and 10000.';
	}
	const trackingStart = values.trackingStartsAt.trim();
	if (trackingStart && !/^\d{4}-\d{2}-\d{2}$/.test(trackingStart)) {
		return 'Tracking start date must be YYYY-MM-DD.';
	}
	if (trackingStart && Number.isNaN(new Date(`${trackingStart}T00:00:00Z`).getTime())) {
		return 'Tracking start date is not a valid date.';
	}
	if (values.outUrl.trim() && !isHttpUrl(values.outUrl.trim())) {
		return 'Webhook URL must start with http:// or https://';
	}
	return null;
}

const asRecords = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value)
		? value.filter(
				(entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object'
			)
		: [];

const asTracks = (value: unknown): Track[] =>
	allTracks.filter((track) => Array.isArray(value) && value.includes(track));

const asId = (value: unknown): string => (typeof value === 'string' ? value : '');

export function normalizeTools(raw: {
	checklist: unknown;
	fields: unknown;
	snippets: unknown;
}): ToolsDraft {
	return {
		checklist: asRecords(raw.checklist).map((item) => ({
			id: asId(item.id),
			label: String(item.label ?? '').trim(),
			tracks: asTracks(item.tracks)
		})),
		fields: asRecords(raw.fields).map((field) => {
			const type = fieldTypes.some((entry) => entry.value === field.type)
				? (field.type as FieldType)
				: 'checkbox';
			const label = String(field.label ?? '').trim();
			return {
				id: asId(field.id),
				type,
				label,
				description: String(field.description ?? '').trim() || null,
				key: fieldKeyFor(String(field.key ?? ''), label),
				options:
					hasOptions(type) && Array.isArray(field.options)
						? field.options.map((option) => String(option).trim()).filter(Boolean)
						: [],
				required: field.required === true,
				tracks: asTracks(field.tracks)
			};
		}),
		snippets: asRecords(raw.snippets).map((snippet) => ({
			id: asId(snippet.id),
			name: slugName(String(snippet.name ?? '')),
			body: String(snippet.body ?? '').trim()
		}))
	};
}

export function validateChecklist(checklist: ChecklistDraft[]): string | null {
	for (const item of checklist) {
		if (!item.label) return 'Every checklist item needs a label.';
		if (!item.tracks.length) return `"${item.label}" needs at least one track.`;
	}
	return null;
}

export function validateFields(fields: FieldDraft[]): string | null {
	const seenKeys = new Set<string>();
	for (const field of fields) {
		if (!field.label) return 'Every review field needs a title.';
		if (!field.tracks.length) return `"${field.label}" needs at least one track.`;
		if (seenKeys.has(field.key)) {
			return `Two review fields share the value name "${field.key}". Give each its own.`;
		}
		seenKeys.add(field.key);
	}
	return null;
}

export function validateSnippets(snippets: SnippetDraft[]): string | null {
	const seenNames = new Set<string>();
	for (const snippet of snippets) {
		if (!snippet.name) return 'Every snippet needs a name.';
		if (!snippet.body) return `Snippet /${snippet.name} needs text.`;
		if (snippet.body.length > 5000) return `Snippet /${snippet.name} is too long (5000 max).`;
		if (seenNames.has(snippet.name)) return `Two snippets are both named /${snippet.name}.`;
		seenNames.add(snippet.name);
	}
	return null;
}

export const validateTools = (tools: ToolsDraft): string | null =>
	validateChecklist(tools.checklist) ??
	validateFields(tools.fields) ??
	validateSnippets(tools.snippets);

// rows the server has not stored yet carry a temporary id with this prefix
export const isStoredId = (id: string): boolean => id !== '' && !id.startsWith('new-');
