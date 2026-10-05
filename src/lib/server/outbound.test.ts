import { describe, expect, test } from 'bun:test';
import {
	buildShipSnapshot,
	buildShipUpdatedPayload,
	type ReviewSubmissionSource
} from './outboundPayload';
import { buildRedispatchInput, type RedispatchSource } from './outboundRedispatch';
import { baseInput, build, soloShip } from './outboundTestFixtures';

describe('review payload', () => {
	test('approved solo ship', () => {
		const payload = build(
			{
				...baseInput,
				event: 'review.approved',
				decision: 'approved',
				note: 'Nice',
				auditNote: 'checked commits',
				approvedMinutes: 95,
				minutesBreakdown: { hackatime: 60, journals: 20, lapse: 15, program: 0 },
				fields: { quality: 4 }
			},
			soloShip,
			{
				fieldDefinitions: [
					{ key: 'quality', label: 'Quality', type: 'NUMBER' },
					{ key: 'notes', label: 'Notes', type: 'TEXT' }
				]
			}
		);
		expect(JSON.stringify(payload)).toBe(
			'{"event":"review.approved","decision":"approved","id":"sub_solo","external_id":"ext-1",' +
				'"maker":{"email":"ada@example.com","name":"Ada","slack_id":"UADA"},' +
				'"ship":{"title":"Solo Ship","description":"A thing","track":"software","thumbnail_url":null,' +
				'"authors":[{"email":"ada@example.com","name":"Ada"}],' +
				'"repo_url":"https://github.com/maker/solo","demo_url":"https://solo.example.com",' +
				'"hackatime_projects":["solo"]},' +
				'"review":{"note_to_maker":"Nice","reviewer":{"email":"rev@example.com","slack_id":"UREV"},' +
				'"audit_note":"checked commits","approved_minutes":95,"approved_hours":1.6,' +
				'"approved_seconds":5700,' +
				'"minutes_breakdown":{"hackatime":60,"journals":20,"lapse":15,"program":0},' +
				'"seconds_breakdown":{"hackatime":3600,"journals":1200,"lapse":900,"program":0},' +
				'"fields":[{"key":"quality","label":"Quality","type":"NUMBER","value":4},' +
				'{"key":"notes","label":"Notes","type":"TEXT","value":null}]}}'
		);
	});

	test('approved collaborative ship replays a per-person deflate', () => {
		const stored: RedispatchSource = {
			id: 'sub_duo',
			programId: 'prog_1',
			status: 'approved',
			commits: [],
			devlogs: [{ id: 'devlog_1', minutes: 30, seconds: 1800, makerId: 'maker_ada' }],
			clips: [{ id: 'clip_1', lengthSeconds: 600, makerId: 'maker_bob' }],
			hours: {
				hackatimeMinutes: 180,
				afterLastCommitMinutes: 0,
				programMinutes: 0,
				hackatimeSeconds: 10800,
				afterLastCommitSeconds: 0,
				programSeconds: 0
			},
			collaborators: [
				{
					makerId: 'maker_ada',
					hackatimeMinutes: 120,
					afterLastCommitMinutes: 0,
					programMinutes: 0,
					hackatimeSeconds: 7200,
					afterLastCommitSeconds: 0,
					programSeconds: 0
				},
				{
					makerId: 'maker_bob',
					hackatimeMinutes: 60,
					afterLastCommitMinutes: 0,
					programMinutes: 0,
					hackatimeSeconds: 3600,
					afterLastCommitSeconds: 0,
					programSeconds: 0
				}
			],
			reviews: [
				{
					reviewerId: 'user_rev',
					noteToMaker: 'Good work',
					auditNote: 'cut idle time',
					adjustments: {},
					settlementVersion: 2,
					deflateMinutes: 30,
					collaboratorDeflates: { maker_ada: 30 },
					adjustmentsSeconds: {},
					deflateSeconds: 1800,
					collaboratorDeflatesSeconds: { maker_ada: 1800 },
					collaboratorNotes: { maker_bob: 'Great lapse' },
					fieldValues: {},
					technicalFeatures: 'Custom sync engine',
					deflationReason: 'Idle time removed',
					timeEvidence: '',
					supportingEvidence: '',
					hoursReasoning: '',
					additionalJustification: ''
				}
			]
		};
		const input = buildRedispatchInput(stored);
		expect(input).not.toBeNull();
		expect(input!.approvedMinutes).toBe(190);
		expect(input!.minutesBreakdown).toEqual({
			hackatime: 156,
			journals: 24,
			lapse: 10,
			program: 0
		});

		const duoShip: ReviewSubmissionSource = {
			...soloShip,
			id: 'sub_duo',
			externalId: 'ext-2',
			priority: true,
			title: 'Duo Ship',
			hackatimeProjects: ['duo-app', 'duo-fw'],
			authorNameOverrides: { 'BOB@example.com': 'Bobby' },
			collaborators: [
				{
					makerId: 'maker_ada',
					maker: { email: 'ada@example.com', name: 'Ada', slackId: 'UADA', hackatimeUserId: '42' }
				},
				{
					makerId: 'maker_bob',
					maker: { email: 'bob@example.com', name: null, slackId: null, hackatimeUserId: null }
				}
			],
			hours: { trackingFromAt: new Date('2026-01-05T00:00:00Z') },
			clips: [{ url: 'https://lapse.example.com/1' }],
			program: { hoursJustification: true, priorityReview: true }
		};
		const expected = {
			event: 'review.approved',
			decision: 'approved',
			id: 'sub_duo',
			external_id: 'ext-2',
			priority: true,
			maker: { email: 'ada@example.com', name: 'Ada', slack_id: 'UADA' },
			collaborators: [
				{
					email: 'ada@example.com',
					name: 'Ada',
					slack_id: 'UADA',
					hackatime_id: '42',
					approved_minutes: 120,
					approved_hours: 2,
					approved_seconds: 7200,
					minutes_breakdown: { hackatime: 96, journals: 24, lapse: 0, program: 0 },
					seconds_breakdown: { hackatime: 5760, journals: 1440, lapse: 0, program: 0 }
				},
				{
					email: 'bob@example.com',
					name: 'Bobby',
					slack_id: null,
					hackatime_id: null,
					note_to_maker: 'Great lapse',
					approved_minutes: 70,
					approved_hours: 1.2,
					approved_seconds: 4200,
					minutes_breakdown: { hackatime: 60, journals: 0, lapse: 10, program: 0 },
					seconds_breakdown: { hackatime: 3600, journals: 0, lapse: 600, program: 0 }
				}
			],
			ship: {
				title: 'Duo Ship',
				description: 'A thing',
				track: 'software',
				thumbnail_url: null,
				authors: [
					{ email: 'ada@example.com', name: 'Ada' },
					{ email: 'bob@example.com', name: 'Bobby' }
				],
				repo_url: 'https://github.com/maker/solo',
				demo_url: 'https://solo.example.com',
				hackatime_projects: ['duo-app', 'duo-fw']
			},
			review: {
				note_to_maker: 'Good work',
				reviewer: { email: 'rev@example.com', slack_id: 'UREV' },
				audit_note: 'cut idle time',
				approved_minutes: 190,
				approved_hours: 3.2,
				approved_seconds: 11400,
				minutes_breakdown: { hackatime: 156, journals: 24, lapse: 10, program: 0 },
				seconds_breakdown: { hackatime: 9360, journals: 1440, lapse: 600, program: 0 },
				fields: [],
				justification: {
					hackatime_projects: 'duo-app 1/5/2026-2/10/2026, duo-fw 1/5/2026-2/10/2026',
					hackatime_user_id: '42',
					lapse_links: 'https://lapse.example.com/1',
					technical_features: 'Custom sync engine',
					deflation_reason: 'Idle time removed'
				}
			}
		};
		// stringified so key order is asserted too
		expect(JSON.stringify(build(input!, duoShip))).toBe(JSON.stringify(expected));
	});

	test('changes requested without minutes, unknown reviewer', () => {
		const payload = build(
			{ ...baseInput, event: 'review.changes', decision: 'changes', note: 'Add a README' },
			soloShip,
			{ reviewer: null }
		);
		expect(JSON.stringify(payload.review)).toBe('{"note_to_maker":"Add a README","reviewer":null}');
		expect(payload.decision).toBe('changes');
		expect('collaborators' in payload).toBe(false);
		expect('priority' in payload).toBe(false);
	});

	test('rejected with zero minutes', () => {
		const payload = build(
			{
				...baseInput,
				event: 'review.rejected',
				decision: 'rejected',
				note: 'Not original',
				auditNote: '',
				approvedMinutes: 0,
				minutesBreakdown: { hackatime: 0, journals: 0, lapse: 0, program: 0 }
			},
			soloShip
		);
		expect(JSON.stringify(payload.review)).toBe(
			'{"note_to_maker":"Not original","reviewer":{"email":"rev@example.com","slack_id":"UREV"},' +
				'"audit_note":"","approved_minutes":0,"approved_hours":0,"approved_seconds":0,' +
				'"minutes_breakdown":{"hackatime":0,"journals":0,"lapse":0,"program":0},' +
				'"seconds_breakdown":{"hackatime":0,"journals":0,"lapse":0,"program":0}}'
		);
	});

	test('nothing to resend without a decision or a review', () => {
		const empty = { id: 'sub', programId: 'prog_1', commits: [], devlogs: [], clips: [] };
		expect(
			buildRedispatchInput({ ...empty, status: 'approved', collaborators: [], reviews: [] })
		).toBeNull();
		expect(
			buildRedispatchInput({ ...empty, status: 'pending', collaborators: [], reviews: [] })
		).toBeNull();
	});
});

test('ship.updated payload', () => {
	const payload = buildShipUpdatedPayload({
		submissionId: 'sub_solo',
		externalId: 'ext-1',
		ship: buildShipSnapshot(soloShip),
		editor: { email: 'rev@example.com', slackId: null },
		changes: [{ field: 'title', label: 'Title', from: 'Old', to: 'Solo Ship' }]
	});
	expect(JSON.stringify(payload)).toBe(
		'{"event":"ship.updated","id":"sub_solo","external_id":"ext-1",' +
			'"ship":{"title":"Solo Ship","description":"A thing","track":"software","thumbnail_url":null,' +
			'"authors":[{"email":"ada@example.com","name":"Ada"}],' +
			'"repo_url":"https://github.com/maker/solo","demo_url":"https://solo.example.com",' +
			'"hackatime_projects":["solo"]},' +
			'"edited_by":{"email":"rev@example.com","slack_id":null},' +
			'"changes":[{"field":"title","old_value":"Old","new_value":"Solo Ship"}]}'
	);
});
