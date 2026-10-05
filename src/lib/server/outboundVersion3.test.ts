import { describe, expect, test } from 'bun:test';
import type { ReviewSubmissionSource } from './outboundPayload';
import { buildRedispatchInput, type RedispatchSource } from './outboundRedispatch';
import { build, soloShip } from './outboundTestFixtures';

describe('review payload, settlement version 3', () => {
	const reviewText = {
		reviewerId: 'user_rev',
		noteToMaker: 'Nice',
		auditNote: 'checked',
		collaboratorNotes: null,
		fieldValues: {},
		technicalFeatures: '',
		deflationReason: '',
		timeEvidence: '',
		supportingEvidence: '',
		hoursReasoning: '',
		additionalJustification: ''
	};

	test('version 3 solo ship: the shared contract vector', () => {
		const stored: RedispatchSource = {
			id: 'sub_solo',
			programId: 'prog_1',
			status: 'approved',
			commits: [],
			devlogs: [{ id: 'devlog_1', minutes: 31, seconds: 1830, makerId: null }],
			clips: [{ id: 'clip_1', lengthSeconds: 29, makerId: null }],
			hours: {
				hackatimeMinutes: 90,
				afterLastCommitMinutes: 0,
				programMinutes: 0,
				hackatimeSeconds: 5429,
				afterLastCommitSeconds: 0,
				programSeconds: 0
			},
			collaborators: [],
			reviews: [
				{
					...reviewText,
					settlementVersion: 3,
					// a version 3 row never replays from the minute columns
					adjustments: { hackatime: { hackatime: 1 } },
					deflateMinutes: 55,
					collaboratorDeflates: null,
					adjustmentsSeconds: {},
					deflateSeconds: null,
					collaboratorDeflatesSeconds: null
				}
			]
		};
		const input = buildRedispatchInput(stored);
		expect(input!.approvedMinutes).toBeUndefined();
		expect(JSON.stringify(build(input!, soloShip).review)).toBe(
			'{"note_to_maker":"Nice","reviewer":{"email":"rev@example.com","slack_id":"UREV"},' +
				'"audit_note":"checked","approved_minutes":121,"approved_hours":2,"approved_seconds":7288,' +
				'"minutes_breakdown":{"hackatime":90,"journals":30,"lapse":1,"program":0},' +
				'"seconds_breakdown":{"hackatime":5429,"journals":1830,"lapse":29,"program":0},' +
				'"fields":[]}'
		);
	});

	test('version 3 collaborative ship: adjustments and a per-person deflate in seconds', () => {
		const stored: RedispatchSource = {
			id: 'sub_duo',
			programId: 'prog_1',
			status: 'approved',
			commits: [],
			devlogs: [{ id: 'devlog_1', minutes: 31, seconds: 1830, makerId: 'maker_ada' }],
			clips: [{ id: 'clip_1', lengthSeconds: 29, makerId: 'maker_bob' }],
			hours: {
				hackatimeMinutes: 150,
				afterLastCommitMinutes: 0,
				programMinutes: 0,
				hackatimeSeconds: 9000,
				afterLastCommitSeconds: 0,
				programSeconds: 0
			},
			collaborators: [
				{
					makerId: 'maker_ada',
					hackatimeMinutes: 100,
					afterLastCommitMinutes: 0,
					programMinutes: 0,
					hackatimeSeconds: 6000,
					afterLastCommitSeconds: 0,
					programSeconds: 0
				},
				{
					makerId: 'maker_bob',
					hackatimeMinutes: 50,
					afterLastCommitMinutes: 0,
					programMinutes: 0,
					hackatimeSeconds: 3000,
					afterLastCommitSeconds: 0,
					programSeconds: 0
				}
			],
			reviews: [
				{
					...reviewText,
					settlementVersion: 3,
					adjustments: {},
					deflateMinutes: 2,
					collaboratorDeflates: { maker_bob: 2 },
					adjustmentsSeconds: { hackatime: { maker_ada: 5429 } },
					deflateSeconds: 100,
					collaboratorDeflatesSeconds: { maker_bob: 100 }
				}
			]
		};
		const duoShip: ReviewSubmissionSource = {
			...soloShip,
			id: 'sub_duo',
			collaborators: [
				{
					makerId: 'maker_ada',
					maker: { email: 'ada@example.com', name: 'Ada', slackId: 'UADA', hackatimeUserId: '42' }
				},
				{
					makerId: 'maker_bob',
					maker: { email: 'bob@example.com', name: 'Bob', slackId: null, hackatimeUserId: null }
				}
			]
		};
		const payload = build(buildRedispatchInput(stored)!, duoShip);
		const timeOf = (entry: Record<string, unknown>) => ({
			approved_minutes: entry.approved_minutes,
			approved_hours: entry.approved_hours,
			approved_seconds: entry.approved_seconds,
			minutes_breakdown: entry.minutes_breakdown,
			seconds_breakdown: entry.seconds_breakdown
		});
		// ada: 5429 adjusted hackatime + 1830 journals. bob: 3000 + 29, less 100, scaled per source
		expect(payload.collaborators!.map(timeOf)).toEqual([
			{
				approved_minutes: 121,
				approved_hours: 2,
				approved_seconds: 7259,
				minutes_breakdown: { hackatime: 90, journals: 31, lapse: 0, program: 0 },
				seconds_breakdown: { hackatime: 5429, journals: 1830, lapse: 0, program: 0 }
			},
			{
				approved_minutes: 49,
				approved_hours: 0.8,
				approved_seconds: 2929,
				minutes_breakdown: { hackatime: 49, journals: 0, lapse: 0, program: 0 },
				seconds_breakdown: { hackatime: 2901, journals: 0, lapse: 28, program: 0 }
			}
		]);
		expect(timeOf(payload.review)).toEqual({
			approved_minutes: 170,
			approved_hours: 2.8,
			approved_seconds: 10188,
			minutes_breakdown: { hackatime: 139, journals: 31, lapse: 0, program: 0 },
			seconds_breakdown: { hackatime: 8330, journals: 1830, lapse: 28, program: 0 }
		});
		expect(Object.keys(payload.collaborators![1])).toEqual([
			'email',
			'name',
			'slack_id',
			'hackatime_id',
			'approved_minutes',
			'approved_hours',
			'approved_seconds',
			'minutes_breakdown',
			'seconds_breakdown'
		]);
	});
});
