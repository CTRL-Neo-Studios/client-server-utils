import type { H3Event } from "h3";
import { getQuery } from "h3";
import { z } from "zod";
import type {
	PaginatedResult,
	ResolvedCursorPagination,
} from "../../../types/shared/utility";

/** Options for {@link useServerOffsetPagination}. */
interface OffsetPaginationOptions {
	/** Page used when the request omits `page`. Defaults to `1`. */
	defaultPage?: number;
	/** Limit used when the request omits `limit`. Defaults to `20`. */
	defaultLimit?: number;
	/** Upper bound for `limit`. Requests above this are rejected. Defaults to `10000`. */
	maxLimit?: number;
	/** Lower bound for `limit`. Requests below this are rejected. Defaults to `1`. */
	minLimit?: number;
}

/**
 * Parses and validates offset (page/limit) pagination params from an H3 event's
 * query string, then returns helpers for shaping the response.
 *
 * Reads `?page=` and `?limit=`. Both are coerced from strings and bounds-checked;
 * out-of-range values throw a `ZodError` (surfaced as a 500 unless you catch it).
 *
 * @param event The H3 event whose query string holds the pagination params.
 * @param options Defaults and bounds. See {@link OffsetPaginationOptions}.
 * @returns Resolved `page`, `limit`, `offset`, plus `toResult`, `paginate`, and `toCursor`.
 *
 * @example Database-backed — push the slice down to the query
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   const { limit, offset, toResult } = useServerOffsetPagination(event)
 *   const rows = await db.select().from(posts).limit(limit).offset(offset)
 *   const [{ count }] = await db.select({ count: sql`count(*)` }).from(posts)
 *   return toResult(rows, Number(count))
 * })
 * ```
 *
 * @example In-memory — let `paginate` slice and count for you
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   const { paginate } = useServerOffsetPagination(event, { defaultLimit: 50 })
 *   return paginate(await loadEveryPost())
 * })
 * ```
 */
export function useServerOffsetPagination(event: H3Event, options?: OffsetPaginationOptions) {
	const { defaultPage = 1, defaultLimit = 20, maxLimit = 10000, minLimit = 1 } = options ?? {};

	const paginationSchema = z.object({
		page: z.coerce.number().min(1).optional().default(defaultPage),
		limit: z.coerce.number().min(minLimit).max(maxLimit).optional().default(defaultLimit),
	});

	const query = getQuery(event);
	const { page, limit } = paginationSchema.parse(query);
	const offset = (page - 1) * limit;

	/**
	 * Wraps rows you already sliced (via `limit`/`offset`) into a
	 * {@link PaginatedResult}, deriving `totalPages` from `total`.
	 *
	 * Use this when the database did the slicing — pass the *page* of rows and
	 * the *unpaginated* total. To slice in memory instead, use {@link paginate}.
	 *
	 * @param data The current page of rows.
	 * @param total Total row count across all pages, ignoring pagination.
	 */
	function toResult<T>(data: T[], total: number): PaginatedResult<T> {
		return {
			data,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		};
	}

	/**
	 * Slices a full in-memory array down to the requested page and wraps it in a
	 * {@link PaginatedResult}. `total` is taken from the array's length.
	 *
	 * Prefer {@link toResult} with a database-side `LIMIT`/`OFFSET` for large sets —
	 * this loads every row into memory first.
	 *
	 * @param data Every row, unpaginated.
	 */
	function paginate<T>(data: T[]): PaginatedResult<T> {
		const total = data.length;
		const sliced = data.slice(offset, offset + limit);

		return {
			data: sliced,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		};
	}

	/**
	 * Reinterprets these offset params as cursor params, treating `offset` as the
	 * number of rows already consumed.
	 *
	 * Use it when the request speaks page/limit but your data layer only takes
	 * cursor/pageSize. Exact inverse of `useServerCursorPagination().toOffset()`.
	 *
	 * Page 1 yields `cursor: undefined` (nothing consumed yet); later pages yield
	 * `cursor: offset`. This holds only where a numeric cursor means a row offset —
	 * it does **not** apply to keyset cursors that carry a column value such as an
	 * `id` or timestamp, since an offset cannot be recovered from those.
	 *
	 * @example
	 * ```ts
	 * const { toCursor } = useServerOffsetPagination(event)
	 * const { cursor, fetchLimit } = toCursor()
	 * const rows = await fetchFeed({ after: cursor, take: fetchLimit })
	 * ```
	 */
	function toCursor(): ResolvedCursorPagination {
		return {
			cursor: offset === 0 ? undefined : offset,
			pageSize: limit,
			fetchLimit: limit + 1,
		};
	}

	return {
		page,
		limit,
		offset,
		toResult,
		paginate,
		toCursor,
	};
}
