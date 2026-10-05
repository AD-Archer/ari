import { expect, test } from 'bun:test';
import { buildJustification, isDeflated } from './justification';

const emptyInput = {
	hackatimeProjects: [],
	hackatimeUserId: '42',
	trackingFromAt: null,
	receivedAt: new Date('2026-02-10T23:30:00Z'),
	lapseUrls: [],
	technicalFeatures: '',
	deflationReason: ''
};

test('isDeflated', () => {
	expect(isDeflated({}, null)).toBe(false);
	expect(isDeflated(null, 0)).toBe(false);
	expect(isDeflated({ commits: {}, devlogs: {} }, undefined)).toBe(false);
	expect(isDeflated({}, 1)).toBe(true);
	expect(isDeflated({ devlogs: { devlog_1: 10 } }, null)).toBe(true);
});

test('nothing to report yields no block', () => {
	expect(buildJustification(emptyInput)).toBeUndefined();
	expect(buildJustification({ ...emptyInput, lapseUrls: [null, '  '] })).toBeUndefined();
});

test('projects carry the utc window, or bare names when the start is unknown', () => {
	const tracked = { ...emptyInput, hackatimeProjects: [' app ', '', 'firmware'] };
	expect(buildJustification(tracked)).toEqual({
		hackatime_projects: 'app, firmware',
		hackatime_user_id: '42'
	});
	expect(
		buildJustification({ ...tracked, trackingFromAt: new Date('2026-01-05T00:30:00Z') })
			?.hackatime_projects
	).toBe('app 1/5/2026-2/10/2026, firmware 1/5/2026-2/10/2026');
});
