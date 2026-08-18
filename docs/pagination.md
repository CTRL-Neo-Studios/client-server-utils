# Pagination

Server-side composables that parse pagination params out of an H3 event's query string, validate them with Zod, and shape the response. Two styles are provided — offset (`page`/`limit`) and cursor (`cursor`/`pageSize`) — with helpers to convert between them. Available via `@type32/nuxt-cs-utils/server` or as Nuxt server auto-imports.

Unlike the query parsing utilities, **these throw on invalid input** rather than returning `undefined`. See [Validation Errors](#validation-errors).

## Choosing a style

| | Offset | Cursor |
|---|---|---|
| Query params | `?page=2&limit=20` | `?cursor=40&pageSize=20` |
| Jump to arbitrary page | Yes | No — sequential only |
| Total count / page count | Yes (`total`, `totalPages`) | No |
| Extra `COUNT` query needed | Yes, to fill `total` | No — uses an overflow row |
| Stable when rows are inserted | No — rows shift between pages | Yes, with a keyset cursor |
| Best for | Admin tables, numbered pagers | Infinite scroll, feeds, large tables |

---

## `useServerOffsetPagination(event, options?)`

Reads `?page=` and `?limit=`, then returns the resolved values plus response helpers.

```ts
import { useServerOffsetPagination } from '@type32/nuxt-cs-utils/server'
// or as a Nuxt server auto-import

export default defineEventHandler(async (event) => {
  const { limit, offset, toResult } = useServerOffsetPagination(event)

  const rows = await db.select().from(posts).limit(limit).offset(offset)
  const total = await countAllPosts()   // your own unpaginated COUNT

  return toResult(rows, total)
})
```

### Returns

| Field | Type | Description |
|---|---|---|
| `page` | `number` | Resolved 1-based page number. |
| `limit` | `number` | Resolved rows per page. |
| `offset` | `number` | Rows to skip — `(page - 1) * limit`. |
| `toResult` | `(data, total) => PaginatedResult` | Wraps a page you already sliced. |
| `paginate` | `(data) => PaginatedResult` | Slices a full in-memory array. |
| `toCursor` | `() => ResolvedCursorPagination` | Reinterprets these params as cursor params. |

### `OffsetPaginationOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultPage` | `number` | `1` | Page used when the request omits `page`. |
| `defaultLimit` | `number` | `20` | Limit used when the request omits `limit`. |
| `minLimit` | `number` | `1` | Lower bound for `limit`. Below this throws. |
| `maxLimit` | `number` | `10000` | Upper bound for `limit`. Above this throws. |

```ts
useServerOffsetPagination(event, { defaultLimit: 50, maxLimit: 200 })
```

### `toResult(data, total)`

Use when the **database** did the slicing. Pass the current page of rows and the *unpaginated* total; `totalPages` is derived as `Math.ceil(total / limit)`.

```ts
// ?page=2&limit=2, 5 rows in the table
toResult(rowsForPage2, 5)
// { data: [{id:3},{id:4}], total: 5, page: 2, limit: 2, totalPages: 3 }

toResult([], 0)
// { data: [], total: 0, page: 1, limit: 2, totalPages: 0 }
```

### `paginate(data)`

Use when you already hold **every** row in memory. Slices to the requested page and takes `total` from the array's length.

```ts
// ?page=2&limit=2
paginate([{id:1},{id:2},{id:3},{id:4},{id:5}])
// { data: [{id:3},{id:4}], total: 5, page: 2, limit: 2, totalPages: 3 }

// ?page=99&limit=2 — past the end
paginate([{id:1},{id:2},{id:3},{id:4},{id:5}])
// { data: [], total: 5, page: 99, limit: 2, totalPages: 3 }
```

A page past the end yields an empty `data` array — it does **not** throw or clamp to the last page. `total` and `totalPages` stay accurate, so clients can detect the overshoot.

Prefer `toResult` with a database-side `LIMIT`/`OFFSET` for large tables; `paginate` loads every row into memory first.

---

## `useServerCursorPagination(event, options)`

Reads `?cursor=` and `?pageSize=`. `cursor` is kept as an opaque string — it is never coerced to a number, so string, UUID, and large-integer keys are not corrupted. An absent `cursor` means "first page".

The returned `fetchLimit` is `pageSize + 1`. **Always fetch that many rows** — `hasMore` is derived from whether the overflow row came back, which avoids a second `COUNT` query. Both `toResult` and `paginate` expect that extra row and trim it off.

```ts
import { useServerCursorPagination } from '@type32/nuxt-cs-utils/server'
// or as a Nuxt server auto-import

export default defineEventHandler(async (event) => {
  const { cursor, fetchLimit, toResult } = useServerCursorPagination(event, { cursorKey: 'id' })

  const rows = await db.select().from(posts)
    .where(cursor ? gt(posts.id, cursor) : undefined)
    .orderBy(posts.id)
    .limit(fetchLimit)          // pageSize + 1

  return toResult(rows)   // trims the overflow row
})
```

### Returns

| Field | Type | Description |
|---|---|---|
| `cursor` | `string \| undefined` | Opaque cursor string. `undefined` on the first page. |
| `pageSize` | `number` | Resolved rows per page. |
| `fetchLimit` | `number` | `pageSize + 1` — the number of rows to fetch. |
| `toResult` | `(rows) => CursorResult` | Trims the overflow row and wraps the page. |
| `paginate` | `(data) => CursorResult` | Locates the cursor in a full in-memory array and slices. |
| `toOffset` | `() => ResolvedOffsetPagination` | Reinterprets these params as offset params. |

### `CursorPaginationOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `cursorKey` | `string` | Yes | Column holding the cursor value; must match the ORDER BY column. |
| `defaultPageSize` | `number` | `20` | Page size used when the request omits `pageSize`. |
| `minPageSize` | `number` | `1` | Lower bound for `pageSize`. Below this throws. |
| `maxPageSize` | `number` | `100` | Upper bound for `pageSize`. Above this throws. |

### `toResult(rows)`

Pass exactly the rows returned by a `LIMIT fetchLimit` query. `cursorKey` comes from the options you passed to the composable and must be the column you ordered by.

- `hasMore` is `true` when an overflow row is present.
- `nextCursor` is the `cursorKey` of the last **kept** row, or `null` on the final page.

```ts
// ?pageSize=2 — fetched 3 rows (fetchLimit), so there is more
toResult([{id:1},{id:2},{id:3}])
// { data: [{id:1},{id:2}], nextCursor: 2, hasMore: true, pageSize: 2 }

// ?pageSize=5 — only 5 rows exist, no overflow row
toResult([{id:1},{id:2},{id:3},{id:4},{id:5}])
// { data: [...all 5], nextCursor: null, hasMore: false, pageSize: 5 }
```

### `paginate(data)`

Use when you already hold **every** row in memory. Finds the row whose `cursorKey` (from the composable options) equals `cursor` and slices the page that follows it.

```ts
const all = [{id:1},{id:2},{id:3},{id:4},{id:5}]

// ?pageSize=2 — no cursor, first page
paginate(all)  // { data: [{id:1},{id:2}], nextCursor: 2, hasMore: true,  pageSize: 2 }

// ?cursor=2&pageSize=2 — resumes after id 2
paginate(all)  // { data: [{id:3},{id:4}], nextCursor: 4, hasMore: true,  pageSize: 2 }

// ?cursor=4&pageSize=2 — final page
paginate(all)  // { data: [{id:5}],        nextCursor: null, hasMore: false, pageSize: 2 }

// ?cursor=999&pageSize=2 — no such row
paginate(all)  // { data: [],              nextCursor: null, hasMore: false, pageSize: 2 }
```

An unknown cursor yields an **empty page** rather than silently restarting from the beginning, so a stale or tampered cursor cannot quietly re-serve page one.

---

## Converting between styles

Both composables expose a conversion to the other style's params. They are **exact inverses**: `offset → cursor → offset` returns the original `page`, `limit`, and `offset`.

Use these when the HTTP surface speaks one style but your data layer only accepts the other. They convert *params only* — never rows.

### `toCursor()` on the offset composable

```ts
const { toCursor } = useServerOffsetPagination(event)
const { cursor, pageSize, fetchLimit } = toCursor()

// ?page=1&limit=20 → { cursor: undefined, pageSize: 20, fetchLimit: 21 }
// ?page=3&limit=20 → { cursor: 40,        pageSize: 20, fetchLimit: 21 }
```

Page 1 yields `cursor: undefined` (nothing consumed yet); later pages yield `cursor: offset`.

### `toOffset()` on the cursor composable

```ts
const { toOffset } = useServerCursorPagination(event)
const { page, limit, offset } = toOffset()

// (no cursor)            → { page: 1, limit: 20, offset: 0  }
// ?cursor=40&pageSize=20 → { page: 3, limit: 20, offset: 40 }
// ?cursor=45&pageSize=20 → { page: 3, limit: 20, offset: 45 }
```

### Limits of the conversion

> **These conversions treat a numeric cursor as a row offset.** They are meaningless for a true keyset cursor that carries a column value such as an `id` or a timestamp, because a row's position cannot be recovered from its key.

Two consequences worth internalising:

1. **`toOffset()` and `paginate()` read `cursor` differently, by design.** `paginate()` treats it as a keyset value (`findIndex(item => String(item[cursorKey]) === cursor)`); `toOffset()` treats it as a row offset. Mixing both on one request produces wrong results — pick one interpretation per endpoint.
2. **`toOffset()`'s `page` is lossy when `cursor` is not a multiple of `pageSize`.** With `?cursor=45&pageSize=20` you get `page: 3`, whose first row is 40, not 45. `offset` always carries the true cursor, so prefer `limit`/`offset` over `page` when the cursor may be unaligned. The round trip stays exact because `toCursor()` only ever emits aligned multiples.

---

## Result Types

Exported from `@type32/nuxt-cs-utils` (shared, so clients can type their fetch calls too).

```ts
interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface CursorResult<T> {
  data: T[]
  nextCursor: string | number | null
  hasMore: boolean
  pageSize: number
}
```

The resolved param shapes returned by the converters:

```ts
interface ResolvedOffsetPagination { page: number; limit: number; offset: number }
interface ResolvedCursorPagination { cursor: string | number | undefined; pageSize: number; fetchLimit: number }
```

### Request-side helper types

For typing the client's request payload, and the corresponding response:

| Type | Expands to |
|---|---|
| `WithOffsetPagination<T>` | `T & { page?: number; limit?: number }` |
| `WithCursorPagination<T>` | `T & { cursor?: number; pageSize?: number }` |
| `WithPaginatedResult<T>` | `PaginatedResult<T>` |
| `WithCursorResult<T>` | `CursorResult<T>` |

Passing no type argument yields the bare pagination params — `WithOffsetPagination` alone is just `{ page?, limit? }`.

```ts
type PostQuery = WithOffsetPagination<{ search?: string }>
// { search?: string; page?: number; limit?: number }
```

---

## Validation Errors

Params are parsed with Zod, so **malformed or out-of-range input throws a `ZodError`**. Nuxt surfaces an uncaught `ZodError` as a 500, which is rarely what you want for bad client input. Catch it and rethrow a 400:

```ts
export default defineEventHandler(async (event) => {
  let pagination
  try {
    pagination = useServerOffsetPagination(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pagination parameters' })
  }
  // ...
})
```

What throws, given the defaults:

| Query | Outcome |
|---|---|
| `?page=0`, `?page=-1` | Throws — `page` must be ≥ 1 |
| `?page=abc` | Throws — not a number |
| `?page=` (empty value) | Throws — coerces to `0`, below the minimum |
| `?limit=0` | Throws — below `minLimit` |
| `?limit=99999` | Throws — above `maxLimit` (`10000`) |
| `?pageSize=0` | Throws — below `minPageSize` |
| `?pageSize=101` | Throws — above `maxPageSize` (`100`) |
| `?cursor=abc` | Accepted — parsed as the string `"abc"` |
| `?page=1&page=5` (repeated) | Throws — H3 yields an array, which does not coerce |
| _(no query at all)_ | Fine — every param falls back to its default |

Note the contrast with the [query parsing](./query-parsing.md) utilities, which never throw and take the first element of a repeated param. These composables reject repeated params outright.

---

## Behaviour Notes

- **These composables throw; the query parsing utilities do not.** Wrap the call if you need a 400 instead of a 500.
- **`cursor` has no lower bound.** Unlike `pageSize`, a negative `?cursor=-5` is accepted and passed through unvalidated. Feeding one to `toOffset()` produces `{ page: 0, limit: 20, offset: -5 }`, breaking the 1-based `page` contract and yielding a negative `offset` that most drivers reject. Validate the cursor yourself if it reaches the database.
- **`?cursor=` (empty) is treated as an absent cursor**, i.e. the first page — the same as omitting the param entirely.
- **`toOffset()` throws a `TypeError` when the cursor is non-numeric.** A non-numeric cursor is a keyset value (e.g. a UUID), not a row offset, so there is no offset to recover.
- **`page` and `limit` are not required to be integers.** `?page=2.5` is accepted as `2.5`, producing a fractional `offset`. Add your own integer check if that matters to your data layer.
- **A page past the end returns empty `data`, not an error** — `total` and `totalPages` remain accurate so the client can detect it.
- **An unknown cursor returns an empty page**, never a silent restart from the first page.
- **`fetchLimit` is `pageSize + 1` and both cursor helpers expect the overflow row.** Fetch `pageSize` rows instead and `hasMore` will be `false` on a page that actually has a successor.
- **`nextCursor` is `null`, not `undefined`, on the final page** — it survives JSON serialisation, so clients can test it directly.
- **`toResult` needs a total you supply; `paginate` derives it.** Passing an already-sliced page to `paginate` will report the slice's length as `total`.
- **The converters bridge params, not rows**, and assume an offset-style numeric cursor. They do not apply to keyset cursors carrying an `id` or timestamp.
