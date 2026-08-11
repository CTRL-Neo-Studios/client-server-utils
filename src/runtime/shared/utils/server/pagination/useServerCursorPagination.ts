import type { H3Event } from "h3";
import { getQuery } from "h3";
import { z } from "zod";
import type {
	CursorResult,
	ResolvedOffsetPagination,
} from "../../../types/shared/utility";

/** Options for {@link useServerCursorPagination}. */
interface CursorPaginationOptions {
	/** Page size used when the request omits `pageSize`. Defaults to `20`. */
	defaultPageSize?: number;
	/** Upper bound for `pageSize`. Requests above this are rejected. Defaults to `100`. */
	maxPageSize?: number;
	/** Lower bound for `pageSize`. Requests below this are rejected. Defaults to `1`. */
	minPageSize?: number;
}

/**
 * Parses and validates cursor (keyset) pagination params from an H3 event's
 * query string, then returns helpers for shaping the response.
 *
 * Reads `?cursor=` and `?pageSize=`. Both are coerced from strings; `pageSize` is
 * bounds-checked and out-of-range values throw a `ZodError`. An absent `cursor`
 * means "first page".
 *
 * The returned `fetchLimit` is `pageSize + 1` — always fetch that many rows so
 * `hasMore` can be determined from the overflow row instead of a second `COUNT`
 * query. Both `toResult` and `paginate` expect that extra row and trim it off.
 *
 * @param event The H3 event whose query string holds the pagination params.
 * @param options Defaults and bounds. See {@link CursorPaginationOptions}.
 * @returns Resolved `cursor`, `pageSize`, `fetchLimit`, plus `toResult`, `paginate`, and `toOffset`.
 *
 * @example Database-backed — fetch `fetchLimit` rows, let `toResult` trim
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   const { cursor, fetchLimit, toResult } = useServerCursorPagination(event)
 *   const rows = await db.select().from(posts)
 *     .where(cursor ? gt(posts.id, cursor) : undefined)
 *     .orderBy(posts.id)
 *     .limit(fetchLimit)
 *   return toResult(rows, 'id')
 * })
 * ```
 *
 * @example In-memory — `paginate` locates the cursor row and slices
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   const { paginate } = useServerCursorPagination(event)
 *   return paginate(await loadEveryPost(), 'id')
 * })
 * ```
 */
export function useServerCursorPagination(event: H3Event, options?: CursorPaginationOptions) {
	const { defaultPageSize = 20, maxPageSize = 100, minPageSize = 1 } = options ?? {};

	const cursorSchema = z.object({
		cursor: z.coerce.number().optional(),
		pageSize: z.coerce
			.number()
			.min(minPageSize)
			.max(maxPageSize)
			.optional()
			.default(defaultPageSize),
	});

	const query = getQuery(event);
	const parsed = cursorSchema.parse(query);

	const cursor = parsed.cursor;
	const pageSize = parsed.pageSize;
	const fetchLimit = pageSize + 1;

	/**
	 * Trims the `fetchLimit` overflow row off `rows` and wraps the page in a
	 * {@link CursorResult}, deriving `hasMore` and `nextCursor`.
	 *
	 * Pass exactly the rows returned by a `LIMIT fetchLimit` query. `hasMore` is
	 * true when an overflow row is present; `nextCursor` is then the `cursorKey`
	 * of the last *kept* row, or `null` on the final page.
	 *
	 * @param rows Up to `fetchLimit` rows, already ordered by `cursorKey`.
	 * @param cursorKey Column holding the cursor value — must match the ordering column.
	 */
	function toResult<T extends Record<string, any>>(
		rows: T[],
		cursorKey: keyof T,
	): CursorResult<T> {
		const hasMore = rows.length > pageSize;
		const data = hasMore ? rows.slice(0, pageSize) : rows;
		const nextCursor = hasMore ? (data[data.length - 1]?.[cursorKey] ?? null) : null;

		return {
			data,
			nextCursor,
			hasMore,
			pageSize,
		};
	}

	/**
	 * Locates the cursor row in a full in-memory array, slices the following page,
	 * and wraps it in a {@link CursorResult}.
	 *
	 * An unknown `cursor` yields an empty page rather than silently restarting from
	 * the beginning. Prefer {@link toResult} with a database-side `WHERE`/`LIMIT`
	 * for large sets — this loads every row into memory first.
	 *
	 * @param data Every row, unpaginated and ordered by `cursorKey`.
	 * @param cursorKey Column holding the cursor value — must match the ordering column.
	 */
	function paginate<T extends Record<string, any>>(
		data: T[],
		cursorKey: keyof T,
	): CursorResult<T> {
		let startIndex = 0;

		if (cursor != null) {
			const cursorIndex = data.findIndex((item) => item[cursorKey] === cursor);
			startIndex = cursorIndex === -1 ? data.length : cursorIndex + 1;
		}

		const sliced = data.slice(startIndex, startIndex + pageSize + 1);
		const hasMore = sliced.length > pageSize;
		const result = hasMore ? sliced.slice(0, pageSize) : sliced;
		const nextCursor = hasMore ? (result[result.length - 1]?.[cursorKey] ?? null) : null;

		return {
			data: result,
			nextCursor,
			hasMore,
			pageSize,
		};
	}

	/**
	 * Reinterprets these cursor params as offset params, treating `cursor` as the
	 * number of rows already consumed.
	 *
	 * Use it when the request speaks cursor/pageSize but your data layer only takes
	 * page/limit. Exact inverse of `useServerOffsetPagination().toCursor()`.
	 *
	 * An absent `cursor` maps to page 1. This holds only where the numeric cursor
	 * means a row offset — it does **not** apply to keyset cursors that carry a
	 * column value such as an `id` or timestamp, since those bear no relation to a
	 * row's position. `page` is derived as `floor(cursor / pageSize) + 1` and is
	 * therefore only exact when `cursor` is a multiple of `pageSize`; `offset`
	 * always reflects the true cursor.
	 *
	 * @example
	 * ```ts
	 * const { toOffset } = useServerCursorPagination(event)
	 * const { limit, offset } = toOffset()
	 * const rows = await db.select().from(posts).limit(limit).offset(offset)
	 * ```
	 */
	function toOffset(): ResolvedOffsetPagination {
		const resolvedOffset = cursor ?? 0;

		return {
			page: Math.floor(resolvedOffset / pageSize) + 1,
			limit: pageSize,
			offset: resolvedOffset,
		};
	}

	return {
		cursor,
		pageSize,
		fetchLimit,
		toResult,
		paginate,
		toOffset,
	};
}
