import { describe, expect, it, vi } from 'vitest'

// h3 is a transitive Nuxt dependency — under pnpm's strict layout it is not
// hoisted to a top-level `node_modules/h3` symlink, so it cannot be resolved
// from a plain vitest file. The composables only use h3's `getQuery()`; mock
// that one function and drive events with the raw query object directly.
vi.mock('h3', () => ({
	getQuery: (event: any) => event?.__query ?? {},
}))

import { useServerCursorPagination } from '../src/runtime/shared/utils/server/pagination/useServerCursorPagination'
import { useServerOffsetPagination } from '../src/runtime/shared/utils/server/pagination/useServerOffsetPagination'

/** Build a fake H3 event whose parsed query is `query` (values as raw strings). */
const evt = (query: Record<string, unknown> = {}): any => ({ __query: query })

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }))

describe('useServerCursorPagination', () => {
	it('resolves defaults when the query is empty', () => {
		const p = useServerCursorPagination(evt(), { cursorKey: 'id' })
		expect(p.cursor).toBeUndefined()
		expect(p.pageSize).toBe(20)
		expect(p.fetchLimit).toBe(21)
	})

	it('reads cursorKey from options, not a hardcoded column', () => {
		const { toResult } = useServerCursorPagination(evt({ pageSize: '2' }), { cursorKey: 'slug' })
		expect(toResult([{ slug: 'x' }, { slug: 'y' }, { slug: 'z' }])).toEqual({
			data: [{ slug: 'x' }, { slug: 'y' }],
			nextCursor: 'y',
			hasMore: true,
			pageSize: 2,
		})
	})

	it('toResult trims the overflow row and computes nextCursor (numeric)', () => {
		const { toResult } = useServerCursorPagination(evt({ pageSize: '2' }), { cursorKey: 'id' })
		expect(toResult(ids(3))).toEqual({
			data: [{ id: 1 }, { id: 2 }],
			nextCursor: 2,
			hasMore: true,
			pageSize: 2,
		})
	})

	it('toResult emits a string nextCursor for string keys (UUIDs)', () => {
		const { toResult } = useServerCursorPagination(evt({ pageSize: '2' }), { cursorKey: 'id' })
		expect(toResult([{ id: 'a1' }, { id: 'b2' }, { id: 'c3' }])).toEqual({
			data: [{ id: 'a1' }, { id: 'b2' }],
			nextCursor: 'b2',
			hasMore: true,
			pageSize: 2,
		})
	})

	it('toResult reports hasMore false on an exact final page', () => {
		const { toResult } = useServerCursorPagination(evt({ pageSize: '5' }), { cursorKey: 'id' })
		expect(toResult(ids(5))).toEqual({
			data: ids(5),
			nextCursor: null,
			hasMore: false,
			pageSize: 5,
		})
	})

	it('paginate returns the first page when no cursor is present', () => {
		const { paginate } = useServerCursorPagination(evt({ pageSize: '2' }), { cursorKey: 'id' })
		expect(paginate(ids(5))).toEqual({
			data: [{ id: 1 }, { id: 2 }],
			nextCursor: 2,
			hasMore: true,
			pageSize: 2,
		})
	})

	it('paginate resumes after a numeric cursor', () => {
		const { paginate } = useServerCursorPagination(evt({ cursor: '2', pageSize: '2' }), { cursorKey: 'id' })
		expect(paginate(ids(5))).toEqual({
			data: [{ id: 3 }, { id: 4 }],
			nextCursor: 4,
			hasMore: true,
			pageSize: 2,
		})
	})

	it('paginate resumes after a string cursor (previously threw ZodError)', () => {
		const rows = [{ id: 'a1' }, { id: 'b2' }, { id: 'c3' }, { id: 'd4' }, { id: 'e5' }]
		const { paginate } = useServerCursorPagination(evt({ cursor: 'b2', pageSize: '2' }), { cursorKey: 'id' })
		expect(paginate(rows)).toEqual({
			data: [{ id: 'c3' }, { id: 'd4' }],
			nextCursor: 'd4',
			hasMore: true,
			pageSize: 2,
		})
	})

	it('paginate returns an empty page for an unknown cursor', () => {
		const { paginate } = useServerCursorPagination(evt({ cursor: '999', pageSize: '2' }), { cursorKey: 'id' })
		expect(paginate(ids(3))).toEqual({
			data: [],
			nextCursor: null,
			hasMore: false,
			pageSize: 2,
		})
	})

	it('treats an empty cursor string as the first page', () => {
		const { paginate } = useServerCursorPagination(evt({ cursor: '', pageSize: '2' }), { cursorKey: 'id' })
		expect(paginate(ids(3)).data).toEqual([{ id: 1 }, { id: 2 }])
	})

	it('toOffset maps a numeric cursor to page/limit/offset', () => {
		const { toOffset } = useServerCursorPagination(evt({ cursor: '40', pageSize: '20' }), { cursorKey: 'id' })
		expect(toOffset()).toEqual({ page: 3, limit: 20, offset: 40 })
	})

	it('toOffset maps an absent cursor to page 1', () => {
		const { toOffset } = useServerCursorPagination(evt({ pageSize: '20' }), { cursorKey: 'id' })
		expect(toOffset()).toEqual({ page: 1, limit: 20, offset: 0 })
	})

	it('toOffset keeps the true offset for an unaligned cursor', () => {
		const { toOffset } = useServerCursorPagination(evt({ cursor: '45', pageSize: '20' }), { cursorKey: 'id' })
		expect(toOffset()).toEqual({ page: 3, limit: 20, offset: 45 })
	})

	it('toOffset throws for a non-numeric cursor', () => {
		const { toOffset } = useServerCursorPagination(evt({ cursor: 'b2', pageSize: '20' }), { cursorKey: 'id' })
		expect(() => toOffset()).toThrow(TypeError)
	})

	it('rejects an out-of-range pageSize', () => {
		expect(() => useServerCursorPagination(evt({ pageSize: '101' }), { cursorKey: 'id' })).toThrow()
		expect(() => useServerCursorPagination(evt({ pageSize: '0' }), { cursorKey: 'id' })).toThrow()
	})
})

describe('useServerOffsetPagination', () => {
	it('resolves defaults when the query is empty', () => {
		const p = useServerOffsetPagination(evt())
		expect(p.page).toBe(1)
		expect(p.limit).toBe(20)
		expect(p.offset).toBe(0)
	})

	it('derives offset from page and limit', () => {
		const p = useServerOffsetPagination(evt({ page: '3', limit: '20' }))
		expect(p.offset).toBe(40)
	})

	it('toResult wraps a database slice with pagination metadata', () => {
		const { toResult } = useServerOffsetPagination(evt({ page: '2', limit: '2' }))
		expect(toResult([{ id: 3 }, { id: 4 }], 5)).toEqual({
			data: [{ id: 3 }, { id: 4 }],
			total: 5,
			page: 2,
			limit: 2,
			totalPages: 3,
		})
	})

	it('paginate slices a full array in memory', () => {
		const { paginate } = useServerOffsetPagination(evt({ page: '2', limit: '2' }))
		expect(paginate(ids(5))).toEqual({
			data: [{ id: 3 }, { id: 4 }],
			total: 5,
			page: 2,
			limit: 2,
			totalPages: 3,
		})
	})

	it('paginate returns an empty page past the end', () => {
		const { paginate } = useServerOffsetPagination(evt({ page: '99', limit: '2' }))
		expect(paginate(ids(5))).toEqual({
			data: [],
			total: 5,
			page: 99,
			limit: 2,
			totalPages: 3,
		})
	})

	it('toCursor emits no cursor on page 1', () => {
		const { toCursor } = useServerOffsetPagination(evt({ page: '1', limit: '20' }))
		const c = toCursor()
		expect(c.cursor).toBeUndefined()
		expect(c.pageSize).toBe(20)
		expect(c.fetchLimit).toBe(21)
	})

	it('toCursor emits the offset as cursor on later pages', () => {
		const { toCursor } = useServerOffsetPagination(evt({ page: '3', limit: '20' }))
		expect(toCursor()).toEqual({ cursor: 40, pageSize: 20, fetchLimit: 21 })
	})

	it('rejects an out-of-range page or limit', () => {
		expect(() => useServerOffsetPagination(evt({ page: '0' }))).toThrow()
		expect(() => useServerOffsetPagination(evt({ limit: '99999' }))).toThrow()
	})
})

describe('offset ⇄ cursor round trip', () => {
	it('is the identity across pages and limits', () => {
		for (const page of [1, 2, 3, 7, 50]) {
			for (const limit of [1, 5, 20, 100]) {
				const off = useServerOffsetPagination(evt({ page: String(page), limit: String(limit) }))
				const c = off.toCursor()

				const query: Record<string, unknown> = { pageSize: String(c.pageSize) }
				if (c.cursor !== undefined) query.cursor = String(c.cursor)

				const cur = useServerCursorPagination(evt(query), { cursorKey: 'id' })
				expect(cur.toOffset()).toEqual({ page: off.page, limit: off.limit, offset: off.offset })
			}
		}
	})
})
