import type { CreateProgramInput, UpdateProgramInput } from '$lib/server/programs';

const text = (form: FormData, key: string, fallback = '') => String(form.get(key) ?? fallback);
const isOn = (form: FormData, key: string) => form.get(key) === 'on';
const list = (form: FormData, key: string) => form.getAll(key).map(String);

function stepValuesFrom(form: FormData): Record<string, string> {
	try {
		const parsed: unknown = JSON.parse(text(form, 'stepValues', '{}'));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string'
			)
		);
	} catch {
		return {};
	}
}

export const updateInputFrom = (form: FormData): UpdateProgramInput => ({
	programId: text(form, 'programId'),
	name: text(form, 'name'),
	accent: text(form, 'accent'),
	evidence: list(form, 'evidence'),
	allowVms: isOn(form, 'allowVms'),
	secondPass: isOn(form, 'secondPass'),
	organizers: list(form, 'organizers'),
	poc: text(form, 'poc')
});

export const createInputFrom = (form: FormData): CreateProgramInput => ({
	...updateInputFrom(form),
	reviewersChannel: text(form, 'reviewersChannel'),
	trackingStartsAt: text(form, 'trackingStartsAt'),
	cantReviewOwn: isOn(form, 'cantReviewOwn'),
	allowDeflation: isOn(form, 'allowDeflation'),
	hoursJustification: isOn(form, 'hoursJustification'),
	secondPassApproved: isOn(form, 'secondPassApproved'),
	secondPassChanges: isOn(form, 'secondPassChanges'),
	secondPassRejected: isOn(form, 'secondPassRejected'),
	secondPassOrganizerBypass: isOn(form, 'secondPassOrganizerBypass'),
	priorityReview: isOn(form, 'priorityReview'),
	reviewerReauth: isOn(form, 'reviewerReauth'),
	reviewerReauthTtlMinutes: text(form, 'reviewerReauthTtlMinutes', '60'),
	reviewGoal: text(form, 'reviewGoal', '50'),
	stepValues: stepValuesFrom(form)
});
