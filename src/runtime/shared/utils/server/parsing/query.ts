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

type FieldType = 'boolean' | 'number' | 'string' | 'array' | 'date';

export type QueryMapConfig<T> = {
	[K in keyof T]?: NonNullable<T[K]> extends Date
		// 1. If it's exactly a Date, stop recursing
		? FieldType
		// 2. If it's an Array, stop recursing
		: NonNullable<T[K]> extends any[]
			? FieldType
			// 3. If it's a generic Object, recurse!
			: NonNullable<T[K]> extends Record<string, any>
				? QueryMapConfig<NonNullable<T[K]>>
				// 4. Otherwise, it's a primitive
				: FieldType;
};

export function parseQueryObject<T>(query: any, config: QueryMapConfig<T>): T {
	if (!query || typeof query !== 'object' || Array.isArray(query)) {
		return query;
	}

	const result: any = { ...query };

	for (const [key, typeOrConfig] of Object.entries(config as any)) {
		const val = query[key];

		if (val === undefined || val === null) continue;

		if (typeof typeOrConfig === 'object') {
			result[key] = parseQueryObject(val, typeOrConfig as any);
		} else {
			switch (typeOrConfig) {
				case 'boolean': result[key] = queryToBoolean(val); break;
				case 'number': result[key] = queryToNumber(val); break;
				case 'array': result[key] = queryToArray(val); break;
				case 'date': result[key] = queryToDate(val); break; // <-- New Date Case
				case 'string':
					result[key] = Array.isArray(val) ? String(val[0]) : String(val);
					break;
			}
		}
	}

	return result as T;
}
