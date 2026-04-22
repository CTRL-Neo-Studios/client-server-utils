// permission-engine.ts

import type {
	Clause,
	EvalResult,
	Permission,
	PermissionConfig,
	PermissionEngine,
	TraceNode,
	Verdict,
	VerdictOutcome
} from "../../types/shared/permissions";

/* ------------------------------------------------------------------ */
/*  Clause builders                                                    */
/* ------------------------------------------------------------------ */

export function gate<C>(
	name: string,
	fn: (ctx: C) => boolean | Promise<boolean>,
	opts?: { message?: string }
): Clause<C> {
	return { kind: 'gate', name, message: opts?.message, fn }
}

export function prerequisite<C>(
	name: string,
	fn: (ctx: C) => boolean | Promise<boolean>,
	opts?: { message?: string }
): Clause<C> {
	return { kind: 'prerequisite', name, message: opts?.message, fn }
}

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
 */
export function custom<C>(
	name: string,
	fn: (ctx: C) => Verdict | Promise<Verdict>,
	opts?: { message?: string }
): Clause<C> {
	return { kind: 'custom', name, message: opts?.message, fn }
}

export function allOf<C>(...clauses: Clause<C>[]): Clause<C> {
	return { kind: 'allOf', clauses }
}

export function anyOf<C>(...clauses: Clause<C>[]): Clause<C> {
	return { kind: 'anyOf', clauses }
}

export function not<C>(clause: Clause<C>): Clause<C> {
	return { kind: 'not', clause }
}

/* ------------------------------------------------------------------ */
/*  Definition                                                         */
/* ------------------------------------------------------------------ */

export function definePermission<Id extends string, C>(
	config: PermissionConfig<Id, C>
): Permission<Id, C> {
	return { id: config.id, config }
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
		trace.message = clause.message ?? clause.name
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

export async function checkPermission<C, Id extends string>(
	perm: Permission<Id, C>,
	ctx: C
): Promise<Verdict<Id>> {
	const root = allOf(...perm.config.check)
	const res = await runClause(root, ctx, 'check')
	return buildVerdict(perm.id, res, 'check')
}

export async function auditPermission<C, Id extends string>(
	perm: Permission<Id, C>,
	ctx: C
): Promise<Verdict<Id>> {
	const root = allOf(...perm.config.check)
	const res = await runClause(root, ctx, 'audit')
	return buildVerdict(perm.id, res, 'audit')
}

/* ------------------------------------------------------------------ */
/*  Engine factory (with context merging)                              */
/* ------------------------------------------------------------------ */

export function createPermissionEngine<C, U extends string = string>(
	existingBase?: Partial<C>
): PermissionEngine<C, U> {
	const base = existingBase ? { ...existingBase } : undefined

	function resolveContext(ctx: C): C {
		if (!base) return ctx
		return { ...base, ...ctx } as C
	}

	return {
		definePermission: (config) => definePermission(config),

		check: async (perm, ctx) => {
			return checkPermission(perm, resolveContext(ctx))
		},

		audit: async (perm, ctx) => {
			return auditPermission(perm, resolveContext(ctx))
		},

		withContext: (newBase) => {
			const merged = base ? { ...base, ...newBase } : { ...newBase }
			return createPermissionEngine<C, U>(merged)
		},
	}
}
