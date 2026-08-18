export type DeepPartial<T> = T extends object ? {
	[P in keyof T]?: DeepPartial<T[P]>;
} : T;

export interface CursorPagination {
	cursor?: number;
	pageSize?: number;
}

export interface OffsetPagination {
	// number of the page you are on. min 1
	page?: number;
	limit?: number;
}

/**
 * Fully resolved offset params — every field defaulted and validated.
 * This is what `useServerOffsetPagination` exposes and what
 * `useServerCursorPagination().toOffset()` returns.
 */
export interface ResolvedOffsetPagination {
	/** 1-based page number. */
	page: number;
	/** Rows per page. */
	limit: number;
	/** Rows to skip — `(page - 1) * limit`. */
	offset: number;
}

/**
 * Fully resolved cursor params — every field defaulted and validated.
 * This is what `useServerCursorPagination` exposes and what
 * `useServerOffsetPagination().toCursor()` returns.
 */
export interface ResolvedCursorPagination {
	/** Position to resume after, or `undefined` for the first page. */
	cursor: string | number | undefined;
	/** Rows per page. */
	pageSize: number;
	/** `pageSize + 1` — fetch this many to detect `hasMore` without a count query. */
	fetchLimit: number;
}

/** Merges T with cursor pagination params. If no T, just cursor params. */
export type WithCursorPagination<T = void> = T extends void
	? CursorPagination
	: T & CursorPagination;
/** Merges T with offset pagination params. If no T, just offset params. */
export type WithOffsetPagination<T = void> = T extends void
	? OffsetPagination
	: T & OffsetPagination;
/** Merges T with cursor result shape. If no T, just cursor result. */
export type WithCursorResult<T = void> = T extends void ? CursorResult<any> : CursorResult<T>;
/** Merges T with paginated result shape. If no T, just paginated result. */
export type WithPaginatedResult<T = void> = T extends void
	? PaginatedResult<any>
	: PaginatedResult<T>;

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export interface CursorResult<T> {
	data: T[];
	nextCursor: string | number | null;
	hasMore: boolean;
	pageSize: number;
}
