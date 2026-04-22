import type {
	Permission,
	PermissionConfig,
	PermissionEngine,
} from "../../../types/shared/permissions";
import { allOf, auditPermission, checkPermission } from "./runtime";

/**
 * Defines a typed permission. The ID is inferred as a string literal.
 *
 * @example
 * const canCreatePost = definePermission({
 *   id: 'post.create',
 *   check: [
 *     gate('isAuthenticated', (ctx) => !!ctx.user),
 *     condition('isAuthor', (ctx) => ctx.user.id === ctx.post.authorId),
 *   ]
 * })
 */
export function definePermission<const Id extends string, C>(
	config: PermissionConfig<Id, C>
): Permission<Id, C> {
	return { id: config.id, config }
}

/**
 * Creates a permission engine with optional base context merging.
 * Useful for injecting shared dependencies (DB, config, current user)
 * so you don't pass them manually on every check.
 *
 * @example
 * const engine = createPermissionEngine<{ db: Database; user: User }>({ db })
 *
 * const verdict = await engine.check(canCreatePost, { user: currentUser })
 * // Resolved context = { db, user: currentUser }
 */
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
