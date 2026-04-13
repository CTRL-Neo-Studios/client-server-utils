import type { H3Event } from "h3";
import { getQuery } from "h3";
import { z } from "zod";
import type {CursorResult} from "../../../types/shared/utility";

interface CursorPaginationOptions {
	defaultPageSize?: number;
	maxPageSize?: number;
	minPageSize?: number;
}

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

	/** Use when you have the full array in memory — finds the cursor position and slices */
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

	return {
		cursor,
		pageSize,
		fetchLimit,
		toResult,
		paginate,
	};
}
