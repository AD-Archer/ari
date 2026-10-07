import type { User } from '$db';
import { db } from '$lib/server/db';
import {
	fetchNdaStatus,
	isNdaExempt,
	ndaEnabled,
	type NdaLookup,
	type NdaStatus
} from '$lib/server/nda';

export type NdaUser = Pick<User, 'id' | 'email' | 'slackId' | 'ndaSignedAt' | 'ndaCheckedAt'>;

function persistLookup(userId: string, lookup: NdaLookup) {
	const now = new Date();
	// an api outage never clears a signature, only an explicit not_signed does
	const data =
		lookup.status === 'signed'
			? { ndaSignedAt: lookup.signedAt, ndaCheckedAt: now }
			: lookup.status === 'unsigned'
				? { ndaSignedAt: null, ndaCheckedAt: now }
				: { ndaCheckedAt: now };
	return db.user.update({ where: { id: userId }, data });
}

export async function ndaStatus(user: NdaUser, fetchFn?: typeof fetch): Promise<NdaStatus> {
	if (!ndaEnabled()) return 'disabled';
	if (isNdaExempt(user.email)) return 'exempt';

	if (user.ndaSignedAt) {
		const checkedAt = user.ndaCheckedAt?.getTime() ?? 0;
		// 1 day: 24 * 60 * 60 * 1000
		if (user.slackId && Date.now() - checkedAt > 86400000) {
			fetchNdaStatus(user.slackId, fetchFn)
				.then((lookup) => persistLookup(user.id, lookup))
				.catch(() => {});
		}
		return 'signed';
	}

	if (!user.slackId) return 'noSlack';
	const lookup = await fetchNdaStatus(user.slackId, fetchFn);
	if (lookup.status === 'signed') await persistLookup(user.id, lookup);
	return lookup.status;
}
