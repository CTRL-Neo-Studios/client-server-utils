import type {RoleChecker, RoleCheckerConfig, RoleCheckOptions} from "../../types/shared/role-checking";

export function createRoleChecker<TUser, TRole extends string>(
	config: RoleCheckerConfig<TUser, TRole>
): RoleChecker<TUser, TRole> {
	const roleLevelMap = new Map<string, number>(
		config.hierarchy.map((role, index) => [role, index])
	)

	const getRoleLevel = (role?: string | null): number => {
		return roleLevelMap.get(role || '') ?? -1
	}

	const hasMinRole = (user: TUser, minRole: TRole): boolean => {
		return getRoleLevel(config.getRole(user)) >= getRoleLevel(minRole)
	}

	const hasRole = (user: TUser, ...roles: TRole[]): boolean => {
		const userRole = config.getRole(user)
		return roles.some((r) => r === userRole)
	}

	const satisfies = (user: TUser, opts?: RoleCheckOptions<TRole>): boolean => {
		// Banned check (default: reject banned)
		const isBanned = config.getBanned?.(user) ?? false
		if (opts?.banned !== true && isBanned) return false

		// Role check
		if (opts?.roles) {
			if (!hasRole(user, ...opts.roles)) return false
		} else if (opts?.minRole) {
			if (!hasMinRole(user, opts.minRole)) return false
		}

		// Verified check (default: do not require verification)
		const isVerified = config.getVerified?.(user) ?? true
		if (opts?.verified === true && !isVerified) return false

		return true
	}

	const isAuthenticated = (user?: TUser): boolean => {
		if (user == null) return false
		if (config.getAuthIndicator) {
			return !!config.getAuthIndicator(user)
		}
		return true
	}

	return {
		getRoleLevel,
		hasMinRole,
		hasRole,
		satisfies,
		isAuthenticated,
		hierarchy: config.hierarchy,
	}
}
