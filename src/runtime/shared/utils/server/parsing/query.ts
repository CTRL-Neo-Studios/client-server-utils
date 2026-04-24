import { z } from 'zod'

/**
 * Safely converts a query value to a Date object.
 * Handles ISO strings and numeric timestamps.
 */
export function queryToDate(val: any): Date | undefined {
	if (val instanceof Date) return Number.isNaN(val.getTime()) ? undefined : val;
	if (Array.isArray(val)) val = val[0]; // Take first if array

	const str = String(val ?? '').trim();
	if (!str || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'null') return undefined;

	// If it's pure numbers (like a Unix timestamp), parse it as a Number first
	const isNumeric = /^\d+$/.test(str);
	const parsedDate = new Date(isNumeric ? Number(str) : str);

	// Return undefined if the date is invalid (e.g. new Date('hello'))
	return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

/**
 * Safely converts a query value to a Boolean.
 * Handles string 'true'/'false', '1'/'0', and H3 query arrays.
 */
export function queryToBoolean(val: any): boolean | undefined {
	if (typeof val === 'boolean') return val;
	if (Array.isArray(val)) val = val[0]; // If ?flag=true&flag=false, take the first

	const str = String(val ?? '').toLowerCase().trim();
	if (!str || str === 'undefined' || str === 'null') return undefined;

	return str === 'true' || str === '1';
}

/**
 * Safely converts a query value to a Number.
 * Returns undefined if NaN or empty.
 */
export function queryToNumber(val: any): number | undefined {
	if (typeof val === 'number') return val;
	if (Array.isArray(val)) val = val[0];

	const str = String(val ?? '').trim().toLowerCase();
	if (!str || str === 'undefined' || str === 'null') return undefined;

	const num = Number(str);
	return Number.isNaN(num) ? undefined : num;
}

/**
 * Ensures a query value is an Array of a specific type.
 * Useful for handling Enums like status arrays.
 */
export function queryToArray<T>(val: any): T[] | undefined {
	if (val === undefined || val === null || val === '') return undefined;
	const str = String(val).toLowerCase();
	if (str === 'undefined' || str === 'null') return undefined;

	if (Array.isArray(val)) return val as T[];

	return [val] as T[];
}

/* ------------------------------------------------------------------ */
/*  Zod preprocessing helpers                                          */
/* ------------------------------------------------------------------ */

/**
 * Unwraps optional/nullable/default wrappers to find the inner schema type.
 */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
	if (
		schema instanceof z.ZodOptional ||
		schema instanceof z.ZodNullable ||
		schema instanceof z.ZodDefault
	) {
		return unwrap((schema._def as any).innerType)
	}
	return schema
}

/**
 * Wraps a field schema with the appropriate string coercion so that raw
 * H3 query string values are converted to the schema's expected type
 * before Zod validation runs.
 *
 * - `boolean` fields: `'true'/'1'` → `true`, `'false'/'0'` → `false`
 * - `number` fields: numeric strings → number
 * - `date` fields: ISO strings / Unix timestamp strings → Date
 * - `array` fields: single values wrapped in an array
 * - `string`, enums, unions, literals: already strings — no coercion needed
 * - nested `object` fields: recursed into
 */
function coerce(schema: z.ZodTypeAny): any {
	const inner = unwrap(schema)

	if (inner instanceof z.ZodBoolean) {
		return z.string().transform((val) => queryToBoolean(val)).pipe(schema as any)
	}

	if (inner instanceof z.ZodNumber) {
		return z.string().transform((val) => queryToNumber(val)).pipe(schema as any)
	}

	if (inner instanceof z.ZodDate) {
		return z.string().transform((val) => queryToDate(val)).pipe(schema as any)
	}

	if (inner instanceof z.ZodArray) {
		return z.any().transform((val) => queryToArray(val)).pipe(schema as any)
	}

	if (inner instanceof z.ZodObject) {
		return coerceObject(inner)
	}

	// string, enum, union, literal, etc. — already strings from the query
	return schema
}

/**
 * Applies `coerce()` to every field in a ZodObject schema, returning a
 * new schema with all fields wrapped in their respective coercions.
 */
function coerceObject<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<any> {
	const coerced = Object.fromEntries(
		Object.entries(schema.shape).map(([key, fieldSchema]) => [
			key,
			coerce(fieldSchema as z.ZodTypeAny),
		])
	)
	return schema.extend(coerced)
}

/* ------------------------------------------------------------------ */
/*  Main utility                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parses and coerces an H3 query object against a Zod schema.
 *
 * All field values coming from `getQuery()` are strings. `parseQuery`
 * automatically coerces them to the types declared in your schema
 * before validation runs — so `boolean`, `number`, `Date`, and `array`
 * fields work correctly without any manual conversion.
 *
 * @example
 * import { parseQuery } from '@type32/nuxt-cs-utils/server'
 * import { getQuery } from 'h3'
 * import { z } from 'zod'
 *
 * const schema = z.object({
 *   page:   z.number().optional(),
 *   active: z.boolean().optional(),
 *   status: z.enum(['open', 'closed']).optional(),
 * })
 *
 * export default defineEventHandler((event) => {
 *   const query = parseQuery(getQuery(event), schema)
 *   // query: { page?: number, active?: boolean, status?: 'open' | 'closed' }
 * })
 */
export function parseQuery<T extends z.ZodRawShape>(
	query: Record<string, unknown>,
	schema: z.ZodObject<T>
): z.infer<z.ZodObject<T>> {
	return coerceObject(schema).parse(query) as z.infer<z.ZodObject<T>>
}
