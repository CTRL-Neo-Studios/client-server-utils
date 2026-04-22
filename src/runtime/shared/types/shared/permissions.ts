export type VerdictOutcome = 'granted' | 'denied' | 'prerequisite_missing' | 'error'

export interface Verdict<Id extends string = string> {
    granted: boolean
    permissionId: Id
    outcome: VerdictOutcome
    /** Populated when a clause threw at runtime. The permission is denied. */
    error?: Error
    /** Name of the first clause that caused denial. */
    failedAt?: string
    /** Resolved message for the failure point. */
    message?: string
    /** Full evaluation tree. Only populated by `audit()`. */
    trace?: TraceNode
}

export interface TraceNode {
    clause: string
    granted: boolean
    message?: string
    error?: boolean
    children?: TraceNode[]
}

export interface PermissionConfig<Id extends string, C> {
    id: Id
    check: Clause<C>[]
}

export interface Permission<Id extends string, C> {
    id: Id
    config: PermissionConfig<Id, C>
}

interface PrimitiveClause<C> {
    kind: 'gate' | 'prerequisite' | 'condition' | 'custom'
    name: string
    message?: string
    fn:
        | ((ctx: C) => boolean | Promise<boolean>)
        | ((ctx: C) => Verdict | Promise<Verdict>)
}

interface AllOfClause<C> {
    kind: 'allOf'
    clauses: Clause<C>[]
}

interface AnyOfClause<C> {
    kind: 'anyOf'
    clauses: Clause<C>[]
}

interface NotClause<C> {
    kind: 'not'
    clause: Clause<C>
}

export type Clause<C> = PrimitiveClause<C> | AllOfClause<C> | AnyOfClause<C> | NotClause<C>

export interface EvalResult {
    passed: boolean
    trace: TraceNode
    error?: Error
    failedPrerequisite?: boolean
}

export interface PermissionEngine<C, U extends string = string> {
    definePermission: <Id extends U>(config: PermissionConfig<Id, C>) => Permission<Id, C>
    check: <Id extends U>(perm: Permission<Id, C>, ctx: C) => Promise<Verdict<Id>>
    audit: <Id extends U>(perm: Permission<Id, C>, ctx: C) => Promise<Verdict<Id>>
    withContext: (base: Partial<C>) => PermissionEngine<C, U>
}
