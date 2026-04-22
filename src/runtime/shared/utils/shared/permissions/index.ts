// Permission engine — clause builders, standalone runners, and factory
export {
	// Clause builders
	gate,
	prerequisite,
	condition,
	custom,
	allOf,
	anyOf,
	not,
	// Standalone runners
	checkPermission,
	auditPermission,
} from './runtime'

export {
	// Factories
	definePermission,
	createPermissionEngine,
} from './engine'
