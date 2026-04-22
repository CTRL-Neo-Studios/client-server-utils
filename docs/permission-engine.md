# Permission Engine

A declarative, composable permission system. Permissions are built from typed clause trees that are evaluated against a context object, producing a `Verdict`. Supports both fast short-circuit evaluation and full audit traces.

## Core Concepts

| Concept | Description |
|---|---|
| **Context (`C`)** | An arbitrary object passed to every clause at evaluation time. Typically contains the current user, the resource being acted on, and any shared dependencies. |
| **Clause** | A single check, or a logical combination of checks (`allOf`, `anyOf`, `not`). Clauses are composable — any clause can nest other clauses. |
| **Permission** | A named object (`id` + array of clauses) created with `definePermission`. |
| **Verdict** | The result of evaluating a permission. Contains `granted`, `outcome`, and optionally `failedAt`, `message`, `error`, and `trace`. |
| **Trace** | A full tree of every clause evaluation. Only populated when using `audit` mode. |

---

## Defining a Permission

```ts
import { definePermission, gate, condition, prerequisite } from '@type32/nuxt-cs-utils'

type Ctx = {
  user: { id: string; role: 'guest' | 'user' | 'moderator' | 'admin'; banned: boolean; verified: boolean } | null
  post: { authorId: string; published: boolean }
}

export const canEditPost = definePermission<'post.edit', Ctx>({
  id: 'post.edit',
  check: [
    gate('isAuthenticated', (ctx) => ctx.user !== null),
    gate('isNotBanned', (ctx) => ctx.user?.banned === false),
    prerequisite('isVerified', (ctx) => ctx.user?.verified === true),
    condition('isAuthorOrModerator', (ctx) =>
      ctx.user?.id === ctx.post.authorId || ctx.user?.role === 'moderator'
    ),
    condition('postIsPublished', (ctx) => ctx.post.published),
  ],
})
```

The `id` is inferred as a string literal — `'post.edit'` — which flows through to the `Verdict` type.

---

## Clause Builders

All clause builders accept a `name` (used in traces and error messages) and an optional `opts.message` override for the denial message.

### `gate(name, fn, opts?)`

Hard security check. A failing gate always produces `outcome: 'denied'`. Use for checks that must never pass — authentication, ban status, required roles.

```ts
gate('isAuthenticated', (ctx) => ctx.user !== null)
gate('isAdmin', (ctx) => ctx.user?.role === 'admin', { message: 'Admin access required.' })
```

### `prerequisite(name, fn, opts?)`

Setup check. A failing prerequisite produces `outcome: 'prerequisite_missing'` instead of `'denied'`. Use when the user needs to complete an action before access is possible (e.g. enabling 2FA, verifying an email).

```ts
prerequisite('hasVerifiedEmail', (ctx) => ctx.user?.verified === true, {
  message: 'Please verify your email before continuing.',
})
```

This distinction lets the caller present a different UI ("complete setup" vs "access denied").

### `condition(name, fn, opts?)`

Business-logic check. Semantically softer than a gate — use for checks about the resource or context rather than the user's standing. Produces `outcome: 'denied'` on failure.

```ts
condition('postIsPublished', (ctx) => ctx.post.published)
condition('withinEditWindow', (ctx) => Date.now() - ctx.post.createdAt < 86_400_000)
```

### `custom(name, fn, opts?)`

Escape hatch. Your function returns a full `Verdict` which the engine folds into the evaluation. Use for async checks against external systems (billing APIs, feature flags, rate limiters).

```ts
import type { Verdict } from '@type32/nuxt-cs-utils'

custom('hasActiveSubscription', async (ctx): Promise<Verdict> => {
  const active = await billing.checkSubscription(ctx.user!.id)
  return active
    ? { granted: true,  permissionId: 'hasActiveSubscription', outcome: 'granted' }
    : { granted: false, permissionId: 'hasActiveSubscription', outcome: 'denied', message: 'No active subscription.' }
})
```

### `allOf(...clauses)`

AND combinator. All clauses must pass. In `check` mode, short-circuits on the first failure. In `audit` mode, evaluates all clauses.

```ts
allOf(
  gate('isAuthenticated', (ctx) => ctx.user !== null),
  condition('isOwner', (ctx) => ctx.user?.id === ctx.post.authorId),
)
```

### `anyOf(...clauses)`

OR combinator. At least one clause must pass. In `check` mode, short-circuits on the first success. In `audit` mode, evaluates all clauses.

```ts
anyOf(
  condition('isOwner', (ctx) => ctx.user?.id === ctx.post.authorId),
  condition('isModerator', (ctx) => ctx.user?.role === 'moderator'),
)
```

### `not(clause)`

Negates a single clause. If the inner clause passes, `not` fails, and vice versa.

```ts
not(condition('isArchived', (ctx) => ctx.post.archived))
```

If the inner clause throws at runtime, `not` propagates the error rather than negating it.

---

## Running a Permission Check

### Standalone — `checkPermission(perm, ctx)`

Fast mode. Short-circuits on the first failing clause. Use this in production request handlers.

```ts
import { checkPermission } from '@type32/nuxt-cs-utils'

const verdict = await checkPermission(canEditPost, {
  user: currentUser,
  post: targetPost,
})

if (!verdict.granted) {
  throw createError({ statusCode: 403, message: verdict.message })
}
```

### Standalone — `auditPermission(perm, ctx)`

Full evaluation mode. Evaluates every clause in the tree and attaches a complete `trace` to the verdict. Use for debugging or surfacing detailed denial reasons.

```ts
import { auditPermission } from '@type32/nuxt-cs-utils'

const verdict = await auditPermission(canEditPost, { user, post })

console.log(verdict.trace) // full TraceNode tree
```

---

## The Engine Factory

`createPermissionEngine` creates a reusable engine with an optional base context. Shared values (a DB client, config, the current request's user) can be injected once so they don't need to be passed on every call.

```ts
import { createPermissionEngine } from '@type32/nuxt-cs-utils'

type Ctx = {
  db: Database
  user: User | null
  post: Post
}

// Inject shared dependencies at startup
const engine = createPermissionEngine<Ctx>({ db })
```

### `engine.definePermission(config)`

Same as the standalone `definePermission`, but scoped to the engine's context type `C` and permission ID union `U`.

```ts
const canEditPost = engine.definePermission({
  id: 'post.edit',
  check: [ /* clauses */ ],
})
```

### `engine.check(perm, ctx)`

Equivalent to `checkPermission` but merges the engine's base context before evaluating.

```ts
// ctx passed here is merged over the base: { db, ...ctx }
const verdict = await engine.check(canEditPost, { user: currentUser, post: targetPost })
```

### `engine.audit(perm, ctx)`

Equivalent to `auditPermission` with base context merging.

### `engine.withContext(partial)`

Returns a new engine with additional base context merged in. The original engine is unchanged. Useful for creating request-scoped engines from a shared app-level instance.

```ts
// App-level — inject DB once
const appEngine = createPermissionEngine<Ctx>({ db })

// Request-level — add the authenticated user for this request
const requestEngine = appEngine.withContext({ user: currentUser })

// Now user is part of the base — callers only need to pass the resource
const verdict = await requestEngine.check(canEditPost, { post: targetPost })
```

---

## Verdict Reference

### Fields

| Field | Type | Description |
|---|---|---|
| `granted` | `boolean` | `true` if all clauses passed and no error occurred. |
| `permissionId` | `Id` | The ID of the evaluated permission, inferred as a string literal. |
| `outcome` | `VerdictOutcome` | One of `'granted'`, `'denied'`, `'prerequisite_missing'`, `'error'`. |
| `failedAt` | `string \| undefined` | Name of the first clause that caused denial. |
| `message` | `string \| undefined` | Resolved message from the first failing clause. |
| `error` | `Error \| undefined` | Populated if a clause threw an exception. Permission is always denied on error. |
| `trace` | `TraceNode \| undefined` | Full evaluation tree. Only present in audit mode. |

### `VerdictOutcome` values

| Value | When |
|---|---|
| `'granted'` | All clauses passed, no errors. |
| `'denied'` | One or more `gate` or `condition` clauses failed. |
| `'prerequisite_missing'` | A `prerequisite` clause failed (and no error occurred). |
| `'error'` | A clause threw an exception at runtime. |

---

## Audit Trace

`TraceNode` represents one node in the evaluation tree.

```ts
interface TraceNode {
  clause:    string        // clause name, or kind for composites (e.g. 'allOf')
  granted:   boolean       // whether this node passed
  message?:  string        // denial message, if applicable
  error?:    boolean       // true if this node threw
  children?: TraceNode[]   // populated for allOf, anyOf, not
}
```

`trace` is only attached to the `Verdict` when using `auditPermission` or `engine.audit`. In `check` mode, `verdict.trace` is `undefined`.

```ts
const verdict = await auditPermission(canEditPost, { user, post })

// Traverse the tree to find all failing clauses
function failures(node: TraceNode): string[] {
  if (!node.granted && !node.children) return [node.clause]
  return (node.children ?? []).flatMap(failures)
}
```

---

## Integration with Role Checker

The permission engine and role checker are intentionally decoupled. Wire them together by calling role checker methods inside `gate` or `condition` clauses.

```ts
import { createRoleChecker, definePermission, gate, condition, prerequisite } from '@type32/nuxt-cs-utils'

type User = {
  id: string
  role: 'guest' | 'user' | 'moderator' | 'admin'
  banned: boolean
  verified: boolean
}

type Ctx = {
  user: User | null
  post: { authorId: string; published: boolean }
}

const roles = createRoleChecker<User, User['role']>({
  hierarchy: ['guest', 'user', 'moderator', 'admin'],
  getRole:       (u) => u.role,
  getBanned:     (u) => u.banned,
  getVerified:   (u) => u.verified,
  getAuthIndicator: (u) => u.id,
})

export const canEditPost = definePermission<'post.edit', Ctx>({
  id: 'post.edit',
  check: [
    gate('isAuthenticated', (ctx) => roles.isAuthenticated(ctx.user ?? undefined)),
    gate('isNotBanned', (ctx) => ctx.user ? !ctx.user.banned : false),
    prerequisite('isVerified', (ctx) => ctx.user ? ctx.user.verified : false),
    condition('isAuthorOrModerator', (ctx) =>
      ctx.user
        ? ctx.user.id === ctx.post.authorId || roles.hasMinRole(ctx.user, 'moderator')
        : false
    ),
  ],
})
```

Export both `roles` and your permissions from a shared module so the same instances are used across server routes, middleware, and any other context.
