import type { H3Event } from "h3";
import { getQuery } from "h3";
import { z } from "zod";
import type {PaginatedResult} from "../../../types/shared/utility";

interface OffsetPaginationOptions {
	defaultPage?: number;
	defaultLimit?: number;
	maxLimit?: number;
	minLimit?: number;
}

export function useServerOffsetPagination(event: H3Event, options?: OffsetPaginationOptions) {
	const { defaultPage = 1, defaultLimit = 20, maxLimit = 10000, minLimit = 1 } = options ?? {};

	const paginationSchema = z.object({
		page: z.coerce.number().min(1).optional().default(defaultPage),
		limit: z.coerce.number().min(minLimit).max(maxLimit).optional().default(defaultLimit),
	});

	const query = getQuery(event);
	const { page, limit } = paginationSchema.parse(query);
	const offset = (page - 1) * limit;

	function toResult<T>(data: T[], total: number): PaginatedResult<T> {
		return {
			data,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		};
	}

	/** Use when you have the full array in memory — slices it for you */
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

	return {
		page,
		limit,
		offset,
		toResult,
		paginate,
	};
}
