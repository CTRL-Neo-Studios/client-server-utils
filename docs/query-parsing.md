# Query Parsing

Server-side utilities for safely parsing and coercing H3 query string values into properly typed values. Available via `@type32/nuxt-cs-utils/server` or as Nuxt server auto-imports.

The root problem these utilities solve: `getQuery(event)` in H3/Nuxt returns everything as strings (or string arrays), even when the TypeScript type says `number` or `boolean`. These utilities ensure the runtime values actually match the declared types.

---

## `parseQuery(query, schema)`

The primary utility. Accepts the raw query object from `getQuery(event)` and a Zod schema, automatically coerces every field from its raw string representation to the type declared in the schema, then validates and returns the result fully typed.

No separate TypeScript interface needed — the return type is inferred directly from the schema.

```ts
import { parseQuery } from '@type32/nuxt-cs-utils/server'
import { getQuery } from 'h3'
import { z } from 'zod'

const querySchema = z.object({
  page:        z.number().optional(),
  search:      z.string().optional(),
  active:      z.boolean().optional(),
  createdAfter: z.date().optional(),
  status:      z.enum(['open', 'closed', 'pending']).optional(),
})

export default defineEventHandler((event) => {
  const query = parseQuery(getQuery(event), querySchema)
  // {
  //   page?: number          ← '2' → 2
  //   search?: string        ← 'foo' → 'foo'
  //   active?: boolean       ← 'true' → true
  //   createdAfter?: Date    ← '2024-06-01' → Date
  //   status?: 'open' | 'closed' | 'pending'
  // }
})
```

### Coercion rules

`parseQuery` inspects each field in the schema and applies the appropriate coercion before Zod validation runs:

| Schema type | Raw query string | Coerced to |
|---|---|---|
| `z.boolean()` | `'true'`, `'1'` | `true` |
| `z.boolean()` | `'false'`, `'0'` | `false` |
| `z.number()` | `'42'`, `'3.14'` | `42`, `3.14` |
| `z.date()` | `'2024-06-01'`, `'1717228800000'` | `Date` |
| `z.array(...)` | `'active'` (single value) | `['active']` |
| `z.string()` | `'foo'` | `'foo'` (unchanged) |
| `z.enum(...)` | `'open'` | `'open'` (validated, not coerced) |

Coercion is applied recursively to nested `z.object()` schemas. Fields wrapped in `z.optional()`, `z.nullable()`, or `z.default()` are unwrapped first so the coercion still targets the correct inner type.

### String unions and enums

`z.enum()` fields are strings in both raw query and coerced output — no coercion is needed, only validation. If the value isn't in the enum, Zod throws a `ZodError` as normal.

```ts
const querySchema = z.object({
  status: z.enum(['open', 'closed', 'pending']).optional(),
})

// ?status=open   → { status: 'open' }   ✓
// ?status=bogus  → ZodError             ✗
```

### Nested objects

```ts
const querySchema = z.object({
  page: z.number().optional(),
  author: z.object({
    id: z.number(),
    verified: z.boolean().optional(),
  }).optional(),
})

const query = parseQuery(getQuery(event), querySchema)
// query.author.id is number, not string
```

### Validation errors

`parseQuery` calls `.parse()` under the hood, so it throws a `ZodError` on invalid input. Use `.safeParse()` yourself if you need to handle errors without throwing:

```ts
const result = querySchema.parse(getQuery(event)) // throws on error
// or handle manually:
try {
  const query = parseQuery(getQuery(event), querySchema)
} catch (err) {
  if (err instanceof ZodError) {
    throw createError({ statusCode: 400, message: 'Invalid query parameters.' })
  }
  throw err
}
```

---

## Low-level converters

These are the individual coercion functions used internally by `parseQuery`. They are also exported for cases where you need to coerce a single value directly.

All converters return `undefined` rather than throwing on bad input.

### `queryToBoolean(val)`

Converts a query value to `boolean | undefined`.

Accepts `'true'`, `'false'`, `'1'`, `'0'`, actual booleans, and H3 arrays (takes the first element).

```ts
queryToBoolean('true')             // true
queryToBoolean('1')                // true
queryToBoolean('false')            // false
queryToBoolean(['true', 'false'])  // true  (first element)
queryToBoolean('')                 // undefined
queryToBoolean('null')             // undefined
```

### `queryToNumber(val)`

Converts a query value to `number | undefined`.

Accepts numeric strings, actual numbers, and H3 arrays (takes the first element). Returns `undefined` for `NaN`, empty strings, and null-like values.

```ts
queryToNumber('42')          // 42
queryToNumber('3.14')        // 3.14
queryToNumber(['99', '100']) // 99  (first element)
queryToNumber('abc')         // undefined
queryToNumber('')            // undefined
```

### `queryToDate(val)`

Converts a query value to `Date | undefined`.

Accepts ISO 8601 strings, pure numeric strings (Unix ms timestamps), actual `Date` objects, and H3 arrays (takes the first element). Returns `undefined` for invalid dates.

```ts
queryToDate('2024-06-01')            // Date
queryToDate('2024-06-01T12:00:00Z') // Date
queryToDate('1717228800000')         // Date (Unix ms timestamp)
queryToDate('not-a-date')           // undefined
queryToDate('')                      // undefined
```

### `queryToArray<T>(val)`

Ensures a query value is `T[] | undefined`.

If the value is already an array (as H3 produces for repeated params like `?x=a&x=b`), returns it as-is. If it is a scalar, wraps it in a single-element array. Does **not** parse comma-separated strings.

```ts
queryToArray('active')               // ['active']
queryToArray(['active', 'pending'])  // ['active', 'pending']
queryToArray('')                     // undefined
queryToArray(null)                   // undefined
```

---

## Behaviour Notes

- **Nothing throws** — all low-level converters return `undefined` on bad or absent input rather than throwing. `parseQuery` itself throws a `ZodError` on schema validation failure.
- **Multi-value params** — for scalar converters, if H3 produces an array (e.g. `?x=1&x=2`), the **first element** is used.
- **`queryToArray` does not split strings** — `'active,pending'` becomes `['active,pending']`, not `['active', 'pending']`. Split the string first if needed.
- **`parseQuery` requires a `z.object()` schema** — passing a non-object schema (e.g. `z.string()`) is a type error.
