import type {
	Clause,
	EvalResult,
	Permission,
	TraceNode,
	Verdict,
	VerdictOutcome,
} from "../../../types/shared/permissions";

/* ------------------------------------------------------------------ */
/*  Clause builders                                                    */
/* ------------------------------------------------------------------ */

/**
 * Creates a hard gate clause. If it fails, permission is denied.
 * Use for security-critical checks (e.g., "user must be admin").
 */
export function gate<C>(
	name: string,
	fn: (ctx: C) => boolean | Promise<boolean>,
	opts?: { message?: string }
): Clause<C> {
	return { kind: 'gate', name, message: opts?.message, fn }
}

/**
 * Creates a prerequisite clause. If it fails, the outcome is
 * `prerequisite_missing` rather than `denied`.
 * Use for setup steps (e.g., "user must have 2FA enabled").
 */
export function prerequisite<C>(
	name: string,
	fn: (ctx: C) => boolean | Promise<boolean>,
	opts?: { message?: string }
): Clause<C> {
	return { kind: 'prerequisite', name, message: opts?.message, fn }
}

/**
 * Creates a condition clause. Like a gate, but semantically softer.
 * Use for business-logic checks (e.g., "post must be published").
 */
export function condition<C>(
	name: string,
	fn: (ctx: C) => boolean | Promise<boolean>,
	opts?: { message?: string }
): Clause<C> {
	return { kind: 'condition', name, message: opts?.message, fn }
}

/**
 * Escape hatch. Your function returns a Verdict; the engine folds it in.
 * Useful for dynamic billing checks, external API calls, etc.
 *
 * @example
 * custom('hasCredits', async (ctx) => {
 *   const ok = await billing.hasCredits(ctx.userId)
 *   return ok
 *     ? { granted: true, permissionId: 'hasCredits', outcome: 'granted' }
 *     : { granted: false, permissionId: 'hasCredits', outcome: 'denied', message: 'No credits left' }
 * })
 */
export function custom<C>(
	name: string,
	fn: (ctx: C) => Verdict | Promise<Verdict>,
	opts?: { message?: string }
): Clause<C> {
	return { kind: 'custom', name, message: opts?.message, fn }
}

/** Combines clauses with AND logic. All must pass. */
export function allOf<C>(...clauses: Clause<C>[]): Clause<C> {
	return { kind: 'allOf', clauses }
}

/** Combines clauses with OR logic. At least one must pass. */
export function anyOf<C>(...clauses: Clause<C>[]): Clause<C> {
	return { kind: 'anyOf', clauses }
}

/** Negates a single clause. */
export function not<C>(clause: Clause<C>): Clause<C> {
	return { kind: 'not', clause }
}

/* ------------------------------------------------------------------ */
/*  Runtime execution                                                  */
/* ------------------------------------------------------------------ */

async function runClause<C>(
	clause: Clause<C>,
	ctx: C,
	mode: 'check' | 'audit'
): Promise<EvalResult> {
	const trace: TraceNode = { clause: getClauseName(clause), granted: false }

	try {
		switch (clause.kind) {
			case 'gate':
			case 'prerequisite':
			case 'condition': {
				const passed = await (clause.fn as (ctx: C) => boolean | Promise<boolean>)(ctx)
				trace.granted = passed
				if (!passed) {
					trace.message = clause.message ?? clause.name
					return {
						passed: false,
						trace,
						failedPrerequisite: clause.kind === 'prerequisite',
					}
				}
				return { passed: true, trace }
			}

			case 'custom': {
				const verdict = await (clause.fn as (ctx: C) => Verdict | Promise<Verdict>)(ctx)
				trace.granted = verdict.granted
				trace.message = verdict.message ?? clause.message ?? clause.name

				return {
					passed: verdict.granted,
					trace,
					error: verdict.error,
					failedPrerequisite: verdict.outcome === 'prerequisite_missing',
				}
			}

			case 'not': {
				const child = await runClause(clause.clause, ctx, mode)
				trace.children = [child.trace]

				if (child.error) {
					trace.granted = false
					trace.error = true
					return { passed: false, trace, error: child.error }
				}

				trace.granted = !child.passed
				return {
					passed: !child.passed,
					trace,
					failedPrerequisite: child.failedPrerequisite,
				}
			}

			case 'allOf': {
				let passed = true
				let error: Error | undefined
				let failedPrerequisite = false
				trace.children = []

				for (const child of clause.clauses) {
					const res = await runClause(child, ctx, mode)
					trace.children.push(res.trace)

					if (res.error) error = res.error
					if (res.failedPrerequisite) failedPrerequisite = true
					if (!res.passed) passed = false

					if (mode === 'check' && !res.passed) {
						return { passed: false, trace, error, failedPrerequisite }
					}
				}

				return { passed, trace, error, failedPrerequisite }
			}

			case 'anyOf': {
				let passed = false
				let error: Error | undefined
				let failedPrerequisite = false
				trace.children = []

				for (const child of clause.clauses) {
					const res = await runClause(child, ctx, mode)
					trace.children.push(res.trace)

					if (res.error) error = res.error
					if (res.failedPrerequisite) failedPrerequisite = true
					if (res.passed) passed = true

					if (mode === 'check' && res.passed) {
						return { passed: true, trace }
					}
				}

				return { passed, trace, error, failedPrerequisite }
			}
		}
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err))
		trace.granted = false
		trace.error = true
		trace.message = ('name' in clause ? clause.message : undefined) ?? getClauseName(clause)
		return { passed: false, trace, error }
	}
}

function getClauseName<C>(clause: Clause<C>): string {
	if ('name' in clause) return clause.name
	return clause.kind
}

function buildVerdict<Id extends string>(
	id: Id,
	result: EvalResult,
	mode: 'check' | 'audit'
): Verdict<Id> {
	if (result.passed && !result.error) {
		return {
			granted: true,
			permissionId: id,
			outcome: 'granted',
			trace: mode === 'audit' ? result.trace : undefined,
		}
	}

	let outcome: VerdictOutcome = 'denied'
	if (result.error) outcome = 'error'
	else if (result.failedPrerequisite) outcome = 'prerequisite_missing'

	const firstFailure = findFirstFailure(result.trace)

	return {
		granted: false,
		permissionId: id,
		outcome,
		error: result.error,
		failedAt: firstFailure?.clause,
		message: firstFailure?.message,
		trace: mode === 'audit' ? result.trace : undefined,
	}
}

function findFirstFailure(
	trace: TraceNode
): { clause: string; message?: string } | undefined {
	if (!trace.granted || trace.error) {
		return { clause: trace.clause, message: trace.message }
	}
	if (trace.children) {
		for (const child of trace.children) {
			if (!child.granted || child.error) {
				const found = findFirstFailure(child)
				if (found) return found
			}
		}
	}
	return undefined
}

/* ------------------------------------------------------------------ */
/*  Standalone runners                                                 */
/* ------------------------------------------------------------------ */

/**
 * Checks a permission in fast mode (short-circuits on first failure).
 * @returns A verdict with `granted` and optional trace.
 */
export async function checkPermission<C, Id extends string>(
	perm: Permission<Id, C>,
	ctx: C
): Promise<Verdict<Id>> {
	const root = allOf(...perm.config.check)
	const res = await runClause(root, ctx, 'check')
	return buildVerdict(perm.id, res, 'check')
}

/**
 * Audits a permission (evaluates the full tree, useful for debugging).
 * @returns A verdict with a complete `trace` of all clauses.
 */
export async function auditPermission<C, Id extends string>(
	perm: Permission<Id, C>,
	ctx: C
): Promise<Verdict<Id>> {
	const root = allOf(...perm.config.check)
	const res = await runClause(root, ctx, 'audit')
	return buildVerdict(perm.id, res, 'audit')
}
