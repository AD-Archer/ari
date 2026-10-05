import { describe, expect, test } from 'bun:test';
import {
	type buildReviewPayload,
	type DispatchInput,
	type ReviewSubmissionSource
} from './outboundPayload';
import { buildRedispatchInput, type RedispatchSource } from './outboundRedispatch';
import { baseInput, build, soloShip } from './outboundTestFixtures';

describe('hardware justification', () => {
	const hardwareShip: ReviewSubmissionSource = {
		...soloShip,
		id: 'sub_hw',
		title: 'Macro Pad',
		track: 'hardware',
		receivedAt: new Date('2026-03-01T15:30:00Z'),
		repoUrl: 'https://github.com/maker/pad',
		demoUrl: null,
		hackatimeProjects: [],
		hours: { trackingFromAt: null },
		clips: [{ url: ' https://lapse.example.com/a ' }, { url: null }],
		program: { hoursJustification: true, priorityReview: false }
	};
	const input: DispatchInput = {
		...baseInput,
		submissionId: 'sub_hw',
		event: 'review.approved',
		decision: 'approved',
		note: 'Approved',
		approvedSeconds: 19800, // 5h 30m: 5 * 3600 + 30 * 60
		technicalFeatures: 'Custom 4-layer PCB',
		deflationReason: 'Unrelated CAD time'
	};
	const earlierTexts = {
		timeEvidence: '3 journal entries',
		supportingEvidence: 'Photos in repo\n\nBOM attached',
		hoursReasoning: ' Matches journal ',
		additionalJustification: ''
	};
	const justificationOf = (payload: ReturnType<typeof buildReviewPayload>) =>
		payload.review.justification as Record<string, string>;

	test('a new approval carries the evidence and the reviewer inputs, and no generated record', () => {
		expect(JSON.stringify(justificationOf(build(input, hardwareShip)))).toBe(
			'{"lapse_links":"https://lapse.example.com/a","technical_features":"Custom 4-layer PCB","deflation_reason":"Unrelated CAD time"}'
		);
	});

	test('blank earlier-flow texts are left out, as on a review that never had them', () => {
		const blank = {
			timeEvidence: '',
			supportingEvidence: ' \n ',
			hoursReasoning: '',
			additionalJustification: ''
		};
		expect(build({ ...input, ...blank }, hardwareShip)).toEqual(build(input, hardwareShip));
	});

	test('a review recorded on the earlier flow sends the texts it has, and still no record', () => {
		expect(
			JSON.stringify(justificationOf(build({ ...input, ...earlierTexts }, hardwareShip)))
		).toBe(
			'{"lapse_links":"https://lapse.example.com/a","technical_features":"Custom 4-layer PCB","deflation_reason":"Unrelated CAD time","time_evidence":"3 journal entries","supporting_evidence":"Photos in repo\\n\\nBOM attached","hours_reasoning":"Matches journal"}'
		);
	});

	test('a resend reads the earlier-flow texts off the stored review', () => {
		const stored: RedispatchSource = {
			id: 'sub_hw',
			programId: 'prog_1',
			status: 'approved',
			commits: [],
			devlogs: [{ id: 'devlog_1', minutes: 330, seconds: 19800, makerId: null }],
			clips: [],
			hours: null,
			collaborators: [],
			reviews: [
				{
					reviewerId: 'user_rev',
					noteToMaker: 'Approved',
					auditNote: 'checked',
					adjustments: {},
					settlementVersion: 3,
					deflateMinutes: null,
					collaboratorDeflates: null,
					adjustmentsSeconds: {},
					deflateSeconds: null,
					collaboratorDeflatesSeconds: null,
					collaboratorNotes: null,
					fieldValues: {},
					technicalFeatures: 'Custom 4-layer PCB',
					deflationReason: '',
					...earlierTexts
				}
			]
		};
		const resent = justificationOf(build(buildRedispatchInput(stored)!, hardwareShip));
		expect(Object.keys(resent)).toEqual([
			'lapse_links',
			'technical_features',
			'time_evidence',
			'supporting_evidence',
			'hours_reasoning'
		]);
	});

	test('a program with hours justification off gets no justification at all', () => {
		const optedOut = {
			...hardwareShip,
			program: { hoursJustification: false, priorityReview: false }
		};
		expect('justification' in build({ ...input, ...earlierTexts }, optedOut).review).toBe(false);
	});

	test('a revert carries the evidence alone', () => {
		const justification = justificationOf(
			build(
				{ ...baseInput, event: 'review.reverted', decision: null, note: 'Reopened' },
				hardwareShip
			)
		);
		expect(justification).toEqual({ lapse_links: 'https://lapse.example.com/a' });
	});
});
