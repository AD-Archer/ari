import { submitAction } from '$lib/actions';
import { toast } from '$lib/toast.svelte';
import {
	evidenceKinds,
	normalizeTools,
	settingsTexts,
	settingsToggles,
	validateSettings,
	validateTools,
	type SettingsValues,
	type ToolsDraft
} from '$lib/settingsRules';

interface Loaded {
	settings: SettingsValues;
	tools: ToolsDraft;
}

const toolsFingerprint = (tools: ToolsDraft): string =>
	JSON.stringify([
		tools.checklist.map((item) => [item.id, item.label, [...item.tracks].sort()]),
		tools.fields.map((field) => [
			field.id,
			field.type,
			field.label,
			field.description ?? '',
			field.key,
			field.options,
			field.required,
			[...field.tracks].sort()
		]),
		tools.snippets.map((snippet) => [snippet.id, snippet.name, snippet.body])
	]);

function settingsBody(values: SettingsValues, extra: Record<string, string>): FormData {
	const body = new FormData();
	for (const kind of evidenceKinds) if (values.accepts[kind]) body.set(`accept_${kind}`, 'on');
	for (const key of settingsToggles) if (values[key]) body.set(key, 'on');
	for (const key of settingsTexts) body.set(key, String(values[key]).trim());
	for (const [key, value] of Object.entries(extra)) body.set(key, value);
	return body;
}

export function createSettingsForm(loaded: () => Loaded) {
	let values = $state<SettingsValues>(structuredClone(loaded().settings));
	let tools = $state<ToolsDraft>(structuredClone(loaded().tools));
	let staged = $state<Record<string, Record<string, string>>>({});
	let revision = $state(0);
	let saving = $state(false);
	let temporaryIds = 0;

	const settingsDirty = $derived(JSON.stringify(values) !== JSON.stringify(loaded().settings));
	const stagedDirty = $derived(Object.keys(staged).length > 0);
	const toolsDirty = $derived(toolsFingerprint(tools) !== toolsFingerprint(loaded().tools));

	function resetSettings() {
		values = structuredClone(loaded().settings);
		staged = {};
		revision += 1;
	}

	function resetTools() {
		tools = structuredClone(loaded().tools);
	}

	async function save(): Promise<boolean> {
		if (saving) return false;
		const problem =
			(settingsDirty ? validateSettings(values) : null) ??
			(toolsDirty ? validateTools(normalizeTools(tools)) : null);
		if (problem) {
			toast.error(problem);
			return false;
		}
		saving = true;
		try {
			if (settingsDirty || stagedDirty) {
				const extra = Object.assign({}, ...Object.values(staged)) as Record<string, string>;
				const result = await submitAction('save', settingsBody(values, extra), {
					errorToast: true,
					fallbackMessage: 'Could not save settings'
				});
				if (!result.ok) return false;
				// the reload is done, so this picks up the values as the server normalized them
				resetSettings();
			}
			if (toolsDirty) {
				const snapshot = $state.snapshot(tools);
				const result = await submitAction(
					'saveTools',
					{
						checklist: JSON.stringify(snapshot.checklist),
						fields: JSON.stringify(snapshot.fields),
						snippets: JSON.stringify(snapshot.snippets)
					},
					{ errorToast: true, fallbackMessage: 'Could not save reviewer tools' }
				);
				if (!result.ok) return false;
				resetTools();
			}
			toast.success('Settings saved');
			return true;
		} finally {
			saving = false;
		}
	}

	return {
		get values() {
			return values;
		},
		get tools() {
			return tools;
		},
		get dirty() {
			return settingsDirty || stagedDirty || toolsDirty;
		},
		get saving() {
			return saving;
		},
		get revision() {
			return revision;
		},
		newId: () => `new-${++temporaryIds}`,
		stage(cardId: string, entries: Record<string, string> | null) {
			const others = Object.fromEntries(Object.entries(staged).filter(([id]) => id !== cardId));
			staged = entries ? { ...others, [cardId]: entries } : others;
		},
		save,
		discard() {
			resetSettings();
			resetTools();
			toast.info('Changes discarded', { icon: 'x' });
		}
	};
}

export type SettingsForm = ReturnType<typeof createSettingsForm>;
