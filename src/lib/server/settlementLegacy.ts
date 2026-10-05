/* eslint-disable id-length, capitalized-comments -- frozen pre-v3 settlement, kept byte-for-byte for replay: do not edit */
// Verified-time settlement, shared between the reviewer decision path
// (review/[id]) and the organizer second-pass confirm path. It must be pure and
// deterministic: a held approval stores only its per-item `adjustments` plus the
// settlement version, and the confirm step re-derives the exact same breakdown
// from the (frozen) evidence + those adjustments before firing the outbound
// webhook.
//
// Two settlement models share this file (see Review.settlementVersion):
//
//  • v1 (commit-anchored, the original): a person's Hackatime credit came from
//    the coding seconds pinned to THEIR email-matched commits plus a share of
//    the after-last-commit row. Tracked Hackatime time that never anchored to
//    an email-matched commit (noreply git emails, activity that ended before a
//    teammate's last commit) was captured on the collaborator rows and shown
//    on the project chips, but settled to nothing - so people read 0h while
//    their tracked time sat right next to it.
//
//  • v2 (tracked heartbeats): a person's Hackatime credit IS their captured
//    tracked minutes (SubmissionCollaborator.hackatimeMinutes, aggregate
//    HoursBreakdown.hackatimeMinutes on solo ships) - oracle-verified,
//    lapse-deduped and AI-discounted by the ari-webhooks capture. Commits stop
//    driving settlement entirely; they stay on screen as view data. The
//    after-last-commit row is subsumed (tracked minutes already include it).
//
// v1 stays fully intact because every pre-v2 Review row replays under it.

/** Which settlement model interprets the adjustments / produces the minutes. */
export type SettlementVersion = 1 | 2;

/** Per-item minute deflations, keyed by evidence row id. Absent key = full captured value. */
export interface Adjustments {
	/** v1 only: per-commit coding-minute deflations. */
	commits?: Record<string, number>;
	devlogs?: Record<string, number>;
	clips?: Record<string, number>;
	/** v1 only: the single synthetic "time logged after the last commit" row, under the literal key "after". */
	after?: Record<string, number>;
	/** v2 only: the tracked Hackatime row - the literal key "hackatime" on solo
	 * ships, the collaborator's makerId on collaborative ones. */
	hackatime?: Record<string, number>;
	/** The single program-added time row (program-asserted, not evidence), under the literal key "program". */
	program?: Record<string, number>;
}

/**
 * Split `total` minutes across makers in proportion to each one's `captured`
 * share, handing the rounding remainder to the largest fractional parts so the
 * pieces sum to exactly `total`. Returns {} when there's nothing to split.
 */
function allocateProportional(
	total: number,
	shares: { makerId: string; captured: number }[]
): Record<string, number> {
	const out: Record<string, number> = {};
	const cap = shares.reduce((a, s) => a + s.captured, 0);
	if (total <= 0 || cap <= 0) return out;
	const parts = shares.map((s) => {
		const exact = (total * s.captured) / cap;
		const base = Math.floor(exact);
		return { makerId: s.makerId, base, frac: exact - base };
	});
	let left = total - parts.reduce((a, p) => a + p.base, 0);
	parts.sort((a, b) => b.frac - a.frac);
	for (const p of parts) {
		const give = p.base + (left > 0 ? 1 : 0);
		if (left > 0) left--;
		if (give > 0) out[p.makerId] = (out[p.makerId] ?? 0) + give;
	}
	return out;
}

/** Per-person settled minutes on a collaborative ship, keyed by makerId. */
export type CollaboratorMinutes = Record<
	string,
	{ total: number; hackatime: number; journals: number; lapse: number; program: number }
>;

/** Per-person "deflate hours" on a collaborative ship: positive minutes to cut
 *  from THAT person's reported time, keyed by makerId. */
export type CollaboratorDeflates = Record<string, number>;

/**
 * Normalize a raw per-person deflate map against the settled per-person totals:
 * unknown makers dropped, values rounded and clamped to [0, that person's total].
 * Returns the clean map plus its sum (the ship-level minutes actually cut) -
 * both are stored on the Review so replay and displays agree with what shipped.
 */
export function clampCollaboratorDeflates(
	raw: unknown,
	collaborators: CollaboratorMinutes
): { deflates: CollaboratorDeflates; totalMinutes: number } {
	const deflates: CollaboratorDeflates = {};
	let totalMinutes = 0;
	const r = (raw ?? {}) as Record<string, unknown>;
	for (const [makerId, person] of Object.entries(collaborators)) {
		const v = r[makerId];
		if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
		const mins = Math.min(person.total, Math.round(v));
		if (mins <= 0) continue;
		deflates[makerId] = mins;
		totalMinutes += mins;
	}
	return { deflates, totalMinutes };
}

/**
 * Scale `parts` down so they sum to exactly `target`, handing the rounding
 * remainder to the largest fractional parts (largest-remainder). target ≥ sum or
 * sum ≤ 0 returns the parts unchanged; target ≤ 0 zeroes them.
 */
function scaleToTarget(parts: number[], target: number): number[] {
	const sum = parts.reduce((a, b) => a + b, 0);
	if (sum <= 0) return parts.map(() => 0);
	if (target >= sum) return parts.slice();
	if (target <= 0) return parts.map(() => 0);
	const exact = parts.map((p) => (p * target) / sum);
	const out = exact.map((e) => Math.floor(e));
	let left = target - out.reduce((a, b) => a + b, 0);
	const order = exact
		.map((e, i) => ({ i, frac: e - Math.floor(e) }))
		.sort((a, b) => b.frac - a.frac);
	for (const { i } of order) {
		if (left <= 0) break;
		out[i]++;
		left--;
	}
	return out;
}

/**
 * Apply a flat reviewer "deflate" (minutes to subtract from the project total) to a
 * settled result for OUTBOUND reporting only - the stored settlement is canonical and
 * untouched. The total drops by `deflateMinutes` (clamped to [0, approvedMinutes]); the
 * per-source breakdown and per-maker collaborator splits are scaled down proportionally
 * (largest-remainder) so every view still sums to the deflated total.
 *
 * `collaboratorDeflates` (collaborative ships) replaces the proportional split with
 * per-person cuts: each named person's minutes drop by their own amount (clamped to
 * their settled total, their source cells rescaled largest-remainder), everyone else
 * is untouched, and the ship total / breakdown drop by exactly the sum of the cuts.
 * When it carries any positive entry it wins over `deflateMinutes` - callers store
 * the sum there, so applying both would cut twice.
 */
export function applyDeflate(
	settled: {
		approvedMinutes: number;
		breakdown: Record<string, number>;
		collaborators: CollaboratorMinutes;
	},
	deflateMinutes: number | null | undefined,
	collaboratorDeflates?: unknown
): {
	approvedMinutes: number;
	breakdown: Record<string, number>;
	collaborators: CollaboratorMinutes;
} {
	const { deflates: perMaker, totalMinutes: perMakerTotal } = clampCollaboratorDeflates(
		collaboratorDeflates,
		settled.collaborators
	);
	if (perMakerTotal > 0) {
		const collaborators: CollaboratorMinutes = {};
		// How many minutes each SOURCE lost across every person's cut - subtracted from
		// the breakdown so it keeps summing with the per-person splits (any time not
		// attributed to a person, e.g. unmatched-author commits, stays untouched).
		const cut = { hackatime: 0, journals: 0, lapse: 0, program: 0 };
		for (const [makerId, p] of Object.entries(settled.collaborators)) {
			const d = perMaker[makerId] ?? 0;
			if (d <= 0) {
				collaborators[makerId] = { ...p };
				continue;
			}
			const scaled = scaleToTarget([p.hackatime, p.journals, p.lapse, p.program], p.total - d);
			const [hackatime, journals, lapse, program] = scaled;
			cut.hackatime += p.hackatime - hackatime;
			cut.journals += p.journals - journals;
			cut.lapse += p.lapse - lapse;
			cut.program += p.program - program;
			collaborators[makerId] = {
				hackatime,
				journals,
				lapse,
				program,
				total: hackatime + journals + lapse + program
			};
		}
		const breakdown: Record<string, number> = { ...settled.breakdown };
		for (const [source, mins] of Object.entries(cut)) {
			if (mins > 0 && typeof breakdown[source] === 'number')
				breakdown[source] = Math.max(0, breakdown[source] - mins);
		}
		return {
			approvedMinutes: Math.max(0, settled.approvedMinutes - perMakerTotal),
			breakdown,
			collaborators
		};
	}

	const total = settled.approvedMinutes;
	const d = Math.max(0, Math.min(total, Math.round(deflateMinutes ?? 0)));
	if (d === 0) return settled;
	const target = total - d;

	// Breakdown - scale its source values to the deflated total.
	const bKeys = Object.keys(settled.breakdown);
	const bScaled = scaleToTarget(
		bKeys.map((k) => settled.breakdown[k]),
		target
	);
	const breakdown: Record<string, number> = {};
	bKeys.forEach((k, i) => (breakdown[k] = bScaled[i]));

	// Collaborators - one largest-remainder pass across every maker's source cells,
	// so the grand total lands on `target` and each maker's total re-sums its sources.
	const cKeys = Object.keys(settled.collaborators);
	const cells: number[] = [];
	for (const k of cKeys) {
		const p = settled.collaborators[k];
		cells.push(p.hackatime, p.journals, p.lapse, p.program);
	}
	const cScaled = scaleToTarget(cells, target);
	const collaborators: CollaboratorMinutes = {};
	cKeys.forEach((k, i) => {
		const hackatime = cScaled[i * 4];
		const journals = cScaled[i * 4 + 1];
		const lapse = cScaled[i * 4 + 2];
		const program = cScaled[i * 4 + 3];
		collaborators[k] = {
			hackatime,
			journals,
			lapse,
			program,
			total: hackatime + journals + lapse + program
		};
	});

	return { approvedMinutes: target, breakdown, collaborators };
}

/**
 * Clamp raw reviewer adjustments against the captured evidence and compute the
 * final verified total. Deflate-only: each item's minutes ∈ [0, captured].
 * Authoritative - runs server-side at decision time, never trusts the client sum.
 * Evidence items carry their owning collaborator (makerId) on collaborative
 * ships, so the settled minutes also split per person.
 *
 * `version` picks the settlement model (see the file header); it MUST match the
 * version stored on the Review whose adjustments are being replayed, or the
 * recomputed numbers stop matching what was originally sent. New decisions
 * pass 2; pre-v2 rows replay under 1.
 */
export function settleHours(
	raw: unknown,
	evidence: {
		commits: { id: string; codingSeconds: number; makerId?: string | null }[];
		devlogs: { id: string; minutes: number; makerId?: string | null }[];
		clips: { id: string; lengthSeconds: number; makerId?: string | null }[];
		// The ship-level capture: aggregate tracked Hackatime minutes (v2's solo
		// source), the after-last-commit aggregate (v1) and the program-asserted
		// program-added time. Aggregate tracked minutes equal the sum of the
		// per-collaborator ones on collaborative ships (both written by the same
		// ari-webhooks capture).
		hours?: {
			hackatimeMinutes?: number | null;
			afterLastCommitMinutes?: number | null;
			programMinutes?: number | null;
		} | null;
		// Collaborative ships' people, each with their own captured time: tracked
		// Hackatime minutes (v2's per-person source), after-last-commit minutes
		// (v1's allocation weights) and program-added share.
		collaborators?: {
			makerId: string;
			hackatimeMinutes?: number | null;
			afterLastCommitMinutes?: number | null;
			programMinutes?: number | null;
		}[];
	},
	version: SettlementVersion
): {
	adjustments: Adjustments;
	approvedMinutes: number;
	breakdown: Record<string, number>;
	collaborators: CollaboratorMinutes;
} {
	const r = (raw ?? {}) as Record<string, Record<string, unknown>>;
	const adj: Required<Adjustments> = {
		commits: {},
		devlogs: {},
		clips: {},
		after: {},
		hackatime: {},
		program: {}
	};
	const per: CollaboratorMinutes = {};
	const credit = (
		makerId: string | null | undefined,
		source: 'hackatime' | 'journals' | 'lapse' | 'program',
		mins: number
	) => {
		if (!makerId) return;
		const p = (per[makerId] ??= { total: 0, hackatime: 0, journals: 0, lapse: 0, program: 0 });
		p[source] += mins;
		p.total += mins;
	};
	const sum = (
		kind: 'commits' | 'devlogs' | 'clips',
		source: 'hackatime' | 'journals' | 'lapse',
		items: { id: string; mins: number; makerId?: string | null }[]
	): number => {
		let total = 0;
		for (const it of items) {
			const o = r[kind]?.[it.id];
			const captured = Math.round(it.mins);
			const v =
				typeof o === 'number' && Number.isFinite(o)
					? Math.max(0, Math.min(captured, Math.round(o)))
					: captured;
			if (v !== captured) adj[kind][it.id] = v;
			credit(it.makerId, source, v);
			total += v;
		}
		return total;
	};
	const people = evidence.collaborators ?? [];

	// Journals and lapse clips settle identically under both versions.
	const journals = sum(
		'devlogs',
		'journals',
		evidence.devlogs.map((d) => ({ id: d.id, mins: d.minutes, makerId: d.makerId }))
	);
	const lapse = sum(
		'clips',
		'lapse',
		evidence.clips.map((c) => ({ id: c.id, mins: c.lengthSeconds / 60, makerId: c.makerId }))
	);

	// Degraded-capture fallback for v2: the tracked columns were never written
	// (a stale or partial Hackatime capture - ari-webhooks skips them entirely
	// when the fetch is unhealthy) while commit-anchored coding seconds survive.
	// Settling v2 off the empty tracked rows would zero everyone's Hackatime
	// out, so fall back to the v1 commit-anchored computation instead. A
	// healthy capture can't hit this: coding seconds are pinned from the same
	// (lapse-deduped) spans the tracked minutes sum, so tracked minutes are > 0
	// whenever any coding seconds exist.
	const trackedTotal = people.length
		? people.reduce((a, c) => a + Math.round(c.hackatimeMinutes ?? 0), 0)
		: Math.round(evidence.hours?.hackatimeMinutes ?? 0);
	const legacyAnchored =
		version === 2 && trackedTotal <= 0 && evidence.commits.some((c) => c.codingSeconds > 0);

	let hackatime: number;
	if (version === 1 || legacyAnchored) {
		// v1 (or the v2 degraded-capture fallback): commit-anchored Hackatime.
		hackatime = sum(
			'commits',
			'hackatime',
			evidence.commits.map((c) => ({ id: c.id, mins: c.codingSeconds / 60, makerId: c.makerId }))
		);

		// After-last-commit time - a single deflatable row (key "after"), counted
		// as Hackatime. Deflate-only against the aggregate captured value, then
		// split across makers in proportion to their own captured after-minutes
		// so each person's settled total still sums to the aggregate.
		const capturedAfter = Math.round(evidence.hours?.afterLastCommitMinutes ?? 0);
		let after = capturedAfter;
		const ao = r.after?.['after'];
		if (typeof ao === 'number' && Number.isFinite(ao))
			after = Math.max(0, Math.min(capturedAfter, Math.round(ao)));
		if (after !== capturedAfter) adj.after['after'] = after;
		for (const [makerId, mins] of Object.entries(
			allocateProportional(
				after,
				people.map((c) => ({
					makerId: c.makerId,
					captured: Math.round(c.afterLastCommitMinutes ?? 0)
				}))
			)
		))
			credit(makerId, 'hackatime', mins);
		hackatime += after;
	} else if (people.length) {
		// v2 collaborative: one deflatable tracked Hackatime row per person, under
		// that person's makerId. Their captured tracked minutes already carry
		// everything the v1 path split out (pinned commit time, after-last-commit
		// time) - it IS the heartbeat time the capture verified for them.
		hackatime = 0;
		for (const c of people) {
			const captured = Math.round(c.hackatimeMinutes ?? 0);
			const o = r.hackatime?.[c.makerId];
			const v =
				typeof o === 'number' && Number.isFinite(o)
					? Math.max(0, Math.min(captured, Math.round(o)))
					: captured;
			if (v !== captured) adj.hackatime[c.makerId] = v;
			credit(c.makerId, 'hackatime', v);
			hackatime += v;
		}
	} else {
		// v2 solo: one deflatable tracked Hackatime row under the literal key
		// "hackatime". No collaborator rows exist, so no per-person split.
		const captured = Math.round(evidence.hours?.hackatimeMinutes ?? 0);
		const o = r.hackatime?.['hackatime'];
		const v =
			typeof o === 'number' && Number.isFinite(o)
				? Math.max(0, Math.min(captured, Math.round(o)))
				: captured;
		if (v !== captured) adj.hackatime['hackatime'] = v;
		hackatime = v;
	}

	// Program-added time - a single deflatable row (key "program"), its own
	// breakdown source. Evidence-free: the program asserts it at ingest.
	// Deflate-only against the aggregate captured value, then split across
	// makers in proportion to their own captured program-minutes so each
	// person's settled total still sums to the aggregate. Identical under both
	// versions.
	const capturedProgram = Math.round(evidence.hours?.programMinutes ?? 0);
	let program = capturedProgram;
	const po = r.program?.['program'];
	if (typeof po === 'number' && Number.isFinite(po))
		program = Math.max(0, Math.min(capturedProgram, Math.round(po)));
	if (program !== capturedProgram) adj.program['program'] = program;
	for (const [makerId, mins] of Object.entries(
		allocateProportional(
			program,
			people.map((c) => ({
				makerId: c.makerId,
				captured: Math.round(c.programMinutes ?? 0)
			}))
		)
	))
		credit(makerId, 'program', mins);

	return {
		adjustments: adj,
		approvedMinutes: hackatime + journals + lapse + program,
		breakdown: { hackatime, journals, lapse, program },
		collaborators: per
	};
}
