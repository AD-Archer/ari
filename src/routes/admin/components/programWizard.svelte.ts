import type { Component } from 'svelte';
import { privateProvider } from '$private';
import type { WizardStepProps } from '$lib/privateApi';
import { submitAction, type ActionBody } from '$lib/actions';
import {
	editProblem,
	emptyProgramDraft,
	nameProblem,
	stepProblem,
	trackingStartProblem,
	type ProgramDraft,
	type WizardStepId
} from '$lib/programRules';
import type { BoardPerson, BoardProgram } from './boardTypes';

export type ChannelCheck =
	| { state: 'unchecked' }
	| { state: 'checking' }
	| { state: 'ok'; name: string | null }
	| { state: 'unverified' }
	| { state: 'refused'; message: string };

export interface WizardStep {
	id: string;
	label: string;
	description: string;
	builtIn?: WizardStepId;
	component?: Component<WizardStepProps>;
}

const builtInStep = (builtIn: WizardStepId, label: string, description: string): WizardStep => ({
	id: builtIn,
	label,
	description,
	builtIn
});

export const wizardSteps: WizardStep[] = [
	builtInStep('basics', 'Basics', 'Name the program and pick its accent.'),
	builtInStep('evidence', 'Evidence', 'Choose the proof of work ships arrive with.'),
	...privateProvider.slots.wizardSteps.map((step) => ({
		id: step.id,
		label: step.label,
		description: step.description ?? '',
		component: step.component
	})),
	builtInStep('reviewFlow', 'Review flow', 'How reviews work once a ship reaches reviewers.'),
	builtInStep(
		'people',
		'People',
		'Who organizes the program. All of this can change later in settings.'
	)
];

const flag = (enabled: boolean) => (enabled ? 'on' : undefined);

export function createProgramWizard(canManage: () => boolean, ownEmail: () => string) {
	let open = $state(false);
	let editing = $state<BoardProgram | null>(null);
	let stepIndex = $state(0);
	let draft = $state<ProgramDraft>(emptyProgramDraft());
	let stepValues = $state<Record<string, string>>({});
	let channel = $state<ChannelCheck>({ state: 'unchecked' });
	let saving = $state(false);
	let checkSequence = 0;
	let checkTimer: ReturnType<typeof setTimeout> | undefined;

	// the create-only tier organizes and is the poc of what it creates: the server pins the same
	const pinnedSelf = $derived(canManage() ? null : ownEmail().toLowerCase());
	const step = $derived(wizardSteps[stepIndex]);
	const lastStep = $derived(stepIndex === wizardSteps.length - 1);
	const channelPassed = $derived(channel.state === 'ok' || channel.state === 'unverified');

	const blocked = $derived.by(() => {
		if (editing) return editProblem(draft);
		if (!step.builtIn) return null;
		if (step.builtIn !== 'basics') return stepProblem(step.builtIn, draft);
		return (
			nameProblem(draft.name) ??
			(channelPassed ? null : 'Link a reviewers channel Ari is in to continue.') ??
			trackingStartProblem(draft.trackingStartsAt)
		);
	});

	function dropChannelCheck() {
		checkSequence += 1;
		clearTimeout(checkTimer);
		channel = { state: 'unchecked' };
	}

	async function verifyChannel() {
		const raw = draft.reviewersChannel.trim();
		checkSequence += 1;
		const sequence = checkSequence;
		if (!raw) {
			channel = { state: 'unchecked' };
			return;
		}
		channel = { state: 'checking' };
		const result = await submitAction<{ name: string | null; unverified: boolean }>(
			'checkChannel',
			{ channel: raw },
			{ invalidate: false, fallbackMessage: 'Could not check the channel. Try again.' }
		);
		// a newer edit superseded this check
		if (sequence !== checkSequence) return;
		if (!result.ok) channel = { state: 'refused', message: result.message };
		else if (result.data?.unverified) channel = { state: 'unverified' };
		else channel = { state: 'ok', name: result.data?.name ?? null };
	}

	function channelEdited() {
		dropChannelCheck();
		// 500ms: long enough that a pasted or typed id is one request
		checkTimer = setTimeout(verifyChannel, 500);
	}

	function openCreate() {
		editing = null;
		stepIndex = 0;
		draft = emptyProgramDraft();
		stepValues = {};
		dropChannelCheck();
		if (pinnedSelf) {
			draft.organizers = [pinnedSelf];
			draft.poc = pinnedSelf;
		}
		open = true;
	}

	function openEdit(program: BoardProgram) {
		editing = program;
		draft = {
			...emptyProgramDraft(),
			name: program.name,
			accent: program.color,
			evidence: [...program.accepts],
			organizers: [...program.organizers],
			poc: program.poc?.email.toLowerCase() ?? '',
			allowVms: program.allowVms,
			secondPass: program.secondPass
		};
		open = true;
	}

	function removeOrganizer(email: string) {
		draft.organizers = draft.organizers.filter((entry) => entry !== email);
		// the poc must stay an organizer
		if (draft.poc === email) draft.poc = '';
	}

	function addOrganizer(person: BoardPerson) {
		const email = person.email.toLowerCase();
		if (!draft.organizers.includes(email)) draft.organizers = [...draft.organizers, email];
	}

	function body(): ActionBody {
		const shared = {
			name: draft.name,
			accent: draft.accent,
			evidence: draft.evidence,
			organizers: draft.organizers,
			poc: draft.poc,
			allowVms: flag(draft.allowVms),
			secondPass: flag(draft.secondPass)
		};
		if (editing) return { programId: editing.id, ...shared };
		return {
			...shared,
			reviewersChannel: draft.reviewersChannel,
			trackingStartsAt: draft.trackingStartsAt,
			cantReviewOwn: flag(draft.cantReviewOwn),
			allowDeflation: flag(draft.allowDeflation),
			hoursJustification: flag(draft.hoursJustification),
			secondPassApproved: flag(draft.secondPassApproved),
			secondPassChanges: flag(draft.secondPassChanges),
			secondPassRejected: flag(draft.secondPassRejected),
			secondPassOrganizerBypass: flag(draft.secondPassOrganizerBypass),
			priorityReview: flag(draft.priorityReview),
			reviewerReauth: flag(draft.reviewerReauth),
			reviewerReauthTtlMinutes: draft.reviewerReauthTtlMinutes,
			reviewGoal: draft.reviewGoal,
			stepValues: JSON.stringify(stepValues)
		};
	}

	async function save() {
		if (blocked || saving) return null;
		saving = true;
		const result = await submitAction<{ id?: string }>(editing ? 'update' : 'create', body(), {
			errorToast: true,
			fallbackMessage: 'Could not save program'
		});
		saving = false;
		if (!result.ok) return null;
		open = false;
		return { name: draft.name.trim(), createdId: result.data?.id ?? null };
	}

	return {
		get open() {
			return open;
		},
		set open(next: boolean) {
			open = next;
		},
		get editing() {
			return editing;
		},
		get stepIndex() {
			return stepIndex;
		},
		get step() {
			return step;
		},
		get lastStep() {
			return lastStep;
		},
		get draft() {
			return draft;
		},
		get stepValues() {
			return stepValues;
		},
		get channel() {
			return channel;
		},
		get saving() {
			return saving;
		},
		get pinnedSelf() {
			return pinnedSelf;
		},
		get canManage() {
			return canManage();
		},
		get blocked() {
			return blocked;
		},
		setStepValue: (key: string, value: string) => {
			stepValues[key] = value;
		},
		goTo: (index: number) => {
			if (index <= stepIndex) stepIndex = index;
		},
		next: () => {
			if (!blocked && !lastStep) stepIndex += 1;
		},
		back: () => {
			if (stepIndex > 0) stepIndex -= 1;
		},
		openCreate,
		openEdit,
		channelEdited,
		verifyChannel,
		addOrganizer,
		removeOrganizer,
		save
	};
}

export type ProgramWizard = ReturnType<typeof createProgramWizard>;
