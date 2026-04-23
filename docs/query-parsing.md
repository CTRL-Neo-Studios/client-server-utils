# Query Parsing

Server-side utilities for safely coercing H3 query string values into typed primitives. All functions handle `undefined`, `null`, empty strings, and H3's multi-value arrays (e.g. `?flag=true&flag=false`) without throwing. Available via `@type32/nuxt-cs-utils/server` or as Nuxt server auto-imports.

---

## `queryToBoolean(val)`

Converts a query value to a `boolean`, or `undefined` if the value is absent or unparseable.

**Accepts:** `'true'`, `'false'`, `'1'`, `'0'`, actual `boolean` values, and H3 arrays (takes the first element).

**Returns `undefined` for:** empty string, `'null'`, `'undefined'`, or any value that doesn't match a known truthy/falsy string.

```ts
queryToBoolean('true')          // true
queryToBoolean('1')             // true
queryToBoolean('false')         // false
queryToBoolean('0')             // false
queryToBoolean(['true', 'false']) // true  (first element taken)
queryToBoolean('')              // undefined
queryToBoolean(undefined)       // undefined
queryToBoolean('null')          // undefined
```

---

## `queryToNumber(val)`

Converts a query value to a `number`, or `undefined` if the value is absent or results in `NaN`.

**Accepts:** numeric strings, actual `number` values, and H3 arrays (takes the first element).

**Returns `undefined` for:** empty string, `'null'`, `'undefined'`, and any string that does not parse to a valid number.

```ts
queryToNumber('42')             // 42
queryToNumber('3.14')           // 3.14
queryToNumber(['99', '100'])    // 99  (first element taken)
queryToNumber('abc')            // undefined
queryToNumber('')               // undefined
queryToNumber(undefined)        // undefined
```

---

## `queryToDate(val)`

Converts a query value to a `Date`, or `undefined` if the value is absent or produces an invalid date.

**Accepts:** ISO 8601 strings, Unix timestamps as pure numeric strings, actual `Date` objects, and H3 arrays (takes the first element).

**Returns `undefined` for:** empty string, `'null'`, `'undefined'`, invalid date strings, and `Date` objects that are already `NaN`.

```ts
queryToDate('2024-06-01')               // Date (June 1 2024)
queryToDate('2024-06-01T12:00:00Z')     // Date (June 1 2024 12:00 UTC)
queryToDate('1717228800000')            // Date (Unix ms timestamp)
queryToDate('not-a-date')              // undefined
queryToDate('')                        // undefined
queryToDate(undefined)                 // undefined
```

---

## `queryToArray<T>(val)`

Ensures a query value is an array of type `T`, or `undefined` if the value is absent.

If the value is already an array (as H3 produces for repeated params), it is returned as-is. If it is a scalar, it is wrapped in a single-element array. Does **not** parse comma-separated strings.

**Returns `undefined` for:** `undefined`, `null`, and empty string.

```ts
queryToArray('active')               // ['active']
queryToArray(['active', 'pending'])  // ['active', 'pending']
queryToArray('')                     // undefined
queryToArray(null)                   // undefined
queryToArray(undefined)              // undefined
```

With a type parameter:

```ts
type Status = 'active' | 'pending' | 'archived'

const statuses = queryToArray<Status>(getQuery(event).status)
// Status[] | undefined
```

---

## `parseQueryObject(query, config)`

Parses a raw H3 query object into a typed value `T` by applying per-field type coercions defined in a `QueryMapConfig<T>`.

Keys not listed in the config are passed through unchanged. Keys with `null` or `undefined` values are skipped.

```ts
import { parseQueryObject } from '@type32/nuxt-cs-utils/server'
// or as a Nuxt server auto-import

type PostFilters = {
  search: string
  page: number
  published: boolean
  createdAfter: Date
  status: string[]
}

export default defineEventHandler((event) => {
  const filters = parseQueryObject<PostFilters>(getQuery(event), {
    search: 'string',
    page: 'number',
    published: 'boolean',
    createdAfter: 'date',
    status: 'array',
  })

  // filters is typed as PostFilters
  // e.g. ?page=2&published=true&status=active&status=pending
  // → { page: 2, published: true, status: ['active', 'pending'], ... }
})
```

### Nested objects

`QueryMapConfig<T>` recurses into nested object types. Provide a nested config object instead of a `FieldType` string for nested keys.

```ts
type Filters = {
  page: number
  author: {
    id: number
    verified: boolean
  }
}

const filters = parseQueryObject<Filters>(getQuery(event), {
  page: 'number',
  author: {
    id: 'number',
    verified: 'boolean',
  },
})
```

---

## `QueryMapConfig<T>`

A recursive mapped type that describes how each field of `T` should be coerced.

```ts
type FieldType = 'boolean' | 'number' | 'string' | 'array' | 'date'

type QueryMapConfig<T> = {
  [K in keyof T]?: FieldType | QueryMapConfig<NonNullable<T[K]>>
}
```

All keys are optional — omitting a key leaves its value untouched in the result.

| `FieldType` | Coercion applied |
|---|---|
| `'string'` | `String(val)`, or `String(val[0])` for arrays |
| `'number'` | `queryToNumber(val)` |
| `'boolean'` | `queryToBoolean(val)` |
| `'date'` | `queryToDate(val)` |
| `'array'` | `queryToArray(val)` |
| _(nested object)_ | Recurses with the nested `QueryMapConfig` |

---

## Behaviour Notes

- **Nothing throws** — all converters return `undefined` on bad or absent input rather than throwing.
- **Multi-value params** — for scalar converters (`queryToBoolean`, `queryToNumber`, `queryToDate`), if H3 gives an array (e.g. `?x=1&x=2`), the **first element** is used.
- **`null`/`undefined` fields are skipped** by `parseQueryObject` — they remain in the result as-is without being passed through a coercion function.
- **`queryToArray` does not split strings** — `'active,pending'` becomes `['active,pending']`, not `['active', 'pending']`. Split first if you need that behaviour.
