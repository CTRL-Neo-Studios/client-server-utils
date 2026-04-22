# Role Checker

A hierarchical RBAC utility. You configure it once with your user type and role hierarchy, then use the returned checker anywhere — server routes, permission clauses, middleware, or UI logic.

## Setup

```ts
import { createRoleChecker } from '@type32/nuxt-cs-utils'

type User = {
  id: string
  role: 'guest' | 'user' | 'moderator' | 'admin'
  banned: boolean
  verified: boolean
}

export const roles = createRoleChecker<User, 'guest' | 'user' | 'moderator' | 'admin'>({
  hierarchy: ['guest', 'user', 'moderator', 'admin'], // least → most privileged
  getRole:       (user) => user.role,
  getBanned:     (user) => user.banned,
  getVerified:   (user) => user.verified,
  getAuthIndicator: (user) => user.id,
})
```

Export the instance from a shared file so the same checker is reused everywhere.

### `RoleCheckerConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `hierarchy` | `readonly TRole[]` | Yes | Ordered least → most privileged. Use `as const` for best type inference. |
| `getRole` | `(user: TUser) => TRole \| string \| null \| undefined` | Yes | Extracts the user's role. Return `null` or `undefined` for unauthenticated/unprivileged users. |
| `getBanned` | `(user: TUser) => boolean` | No | Extracts the banned flag. Omit if your schema has no banned concept. |
| `getVerified` | `(user: TUser) => boolean` | No | Extracts the verified flag. Omit if your schema has no verification concept. |
| `getAuthIndicator` | `(user: TUser) => unknown` | No | Returns a truthy value if the user is authenticated (e.g. `user.id`). If omitted, any non-null user is considered authenticated. |

---

## API Reference

### `isAuthenticated(user?)`

Returns `true` if the user is considered authenticated.

- If `user` is `null` or `undefined`, always returns `false`.
- If `getAuthIndicator` is configured, returns `!!getAuthIndicator(user)`.
- If `getAuthIndicator` is not configured, returns `true` for any non-null user.

```ts
roles.isAuthenticated(null)        // false
roles.isAuthenticated(guestUser)   // true  (non-null, no getAuthIndicator override)
roles.isAuthenticated({ ...user, id: '' }) // false  (falsy auth indicator)
```

---

### `hasRole(user, ...roles)`

Returns `true` if the user's role exactly matches any of the provided roles.

```ts
roles.hasRole(user, 'admin')              // exact match only
roles.hasRole(user, 'moderator', 'admin') // true if either matches
```

Does **not** respect hierarchy — a `moderator` does not satisfy `hasRole(user, 'admin')`.
Use `hasMinRole` when you want hierarchy-aware checks.

---

### `hasMinRole(user, minRole)`

Returns `true` if the user's role is at or above `minRole` in the hierarchy.

```ts
// hierarchy: ['guest', 'user', 'moderator', 'admin']
roles.hasMinRole(user, 'user')      // true for user, moderator, admin
roles.hasMinRole(user, 'moderator') // true for moderator, admin only
roles.hasMinRole(user, 'admin')     // true for admin only
```

A role not present in the hierarchy returns level `-1` and always fails.

---

### `satisfies(user, opts?)`

Composite check. Combines role, banned, and verified constraints in a single call.
Returns `true` only if **all** provided constraints pass.

```ts
roles.satisfies(user)                          // banned check only (default behaviour)
roles.satisfies(user, { minRole: 'user' })     // must be user or above, and not banned
roles.satisfies(user, { roles: ['moderator', 'admin'] }) // exact role match, and not banned
roles.satisfies(user, { minRole: 'user', verified: true })  // role + not banned + verified
roles.satisfies(user, { minRole: 'user', banned: true })    // role check, banned users allowed
```

#### `RoleCheckOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `minRole` | `TRole` | — | Minimum role in the hierarchy (inclusive). Ignored if `roles` is also provided. |
| `roles` | `TRole[]` | — | Exact set of allowed roles. Takes precedence over `minRole`. |
| `verified` | `boolean` | `false` | If `true`, user must pass `getVerified`. |
| `banned` | `boolean` | `false` | If `true`, banned users are allowed through. Default behaviour is to reject them. |

---

### `getRoleLevel(role?)`

Returns the numeric index of `role` in the hierarchy. Returns `-1` if the role is unknown or not provided.

```ts
roles.getRoleLevel('guest')     // 0
roles.getRoleLevel('admin')     // 3
roles.getRoleLevel('superuser') // -1
roles.getRoleLevel(undefined)   // -1
```

Useful for comparing role levels directly or building sorted UI lists.

---

### `hierarchy`

The readonly role array passed to `RoleCheckerConfig`. Exposed on the checker so you can
use it to populate dropdowns or role selection UI without duplicating the source of truth.

```ts
// Populate a role selector in a Vue component
const options = roles.hierarchy.map(role => ({ label: role, value: role }))
```

---

## Behaviour Notes

- **`roles` overrides `minRole`** — if both are provided in `satisfies`, `roles` is used for the check and `minRole` is ignored.
- **Banned users are rejected by default** — `satisfies` returns `false` for banned users unless `opts.banned === true` explicitly opts in.
- **Verification is not required by default** — `satisfies` does not check `getVerified` unless `opts.verified === true`.
- **Unknown roles always fail `hasMinRole`** — any role not present in `hierarchy` has level `-1`, which is below every defined role.
- **`getAuthIndicator` is optional** — omitting it means any non-null/undefined user object is treated as authenticated.
