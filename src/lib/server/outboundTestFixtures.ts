import {
	buildReviewPayload,
	type DispatchInput,
	type ReviewSubmissionSource
} from './outboundPayload';

export const reviewer = { email: 'rev@example.com', slackId: 'UREV' };

export const soloShip: ReviewSubmissionSource = {
	id: 'sub_solo',
	externalId: 'ext-1',
	priority: false,
	receivedAt: new Date('2026-02-10T12:00:00Z'),
	title: 'Solo Ship',
	description: 'A thing',
	track: 'software',
	thumbnailUrl: null,
	repoUrl: 'https://github.com/maker/solo',
	demoUrl: 'https://solo.example.com',
	hackatimeProjects: ['solo'],
	authorNameOverrides: null,
	maker: { email: 'ada@example.com', name: 'Ada', slackId: 'UADA', hackatimeUserId: '42' },
	collaborators: [],
	hours: null,
	clips: [],
	program: { hoursJustification: false, priorityReview: false }
};

export const baseInput = {
	programId: 'prog_1',
	submissionId: 'sub_solo',
	reviewerId: 'user_rev'
};

export const build = (
	input: DispatchInput,
	submission: ReviewSubmissionSource,
	overrides: Partial<Parameters<typeof buildReviewPayload>[0]> = {}
) =>
	buildReviewPayload({
		input,
		submission,
		reviewer,
		fieldDefinitions: [],
		...overrides
	});
