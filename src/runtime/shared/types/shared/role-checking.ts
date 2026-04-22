export interface RoleCheckOptions<TRole extends string> {
	/** Minimum role in the hierarchy (inclusive and above). */
	minRole?: TRole
	/** Exact set of allowed roles (overrides minRole). */
	roles?: TRole[]
	/** Require user to be verified? Default: false */
	verified?: boolean
	/** Allow banned users? Default: false */
	banned?: boolean
}

export interface RoleCheckerConfig<TUser, TRole extends string> {
	/** Ordered from least to most privileged. Use `as const` for best inference. */
	hierarchy: readonly TRole[]
	/** Extract the user's role. Return null/undefined if unprivileged/unauthenticated. */
	getRole: (user: TUser) => TRole | string | null | undefined
	/** Extract whether the user is banned. Omit if your schema has no banned concept. */
	getBanned?: (user: TUser) => boolean
	/** Extract whether the user is verified. Omit if your schema has no verification concept. */
	getVerified?: (user: TUser) => boolean
	/** Extract an auth indicator (e.g., `id`). Return a truthy value if authenticated. */
	getAuthIndicator?: (user: TUser) => unknown
}

export interface RoleChecker<TUser, TRole extends string> {
	getRoleLevel(role?: string | null): number
	hasMinRole(user: TUser, minRole: TRole): boolean
	hasRole(user: TUser, ...roles: TRole[]): boolean
	satisfies(user: TUser, opts?: RoleCheckOptions<TRole>): boolean
	isAuthenticated(user?: TUser): boolean
	/** Exposed so you can build UI dropdowns from it. */
	hierarchy: readonly TRole[]
}
