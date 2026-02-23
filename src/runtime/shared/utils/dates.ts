import {
	CalendarDate,
	getLocalTimeZone,
	today,
	fromDate,
	toCalendarDate,
	toCalendarDateTime, CalendarDateTime
} from "@internationalized/date";

export function convertJSDate(jsDate: Date): CalendarDate {
	return toCalendarDate(fromDate(new Date(jsDate), getLocalTimeZone()))
}

export function convertJSDateTime(jsDate: Date): CalendarDateTime {
	return toCalendarDateTime(fromDate(new Date(jsDate), getLocalTimeZone()))
}

export function getTodayDate(): CalendarDate {
	return today(getLocalTimeZone())
}

export function wrapDate(date?: Date | null): Date {
	if (!date)
		return new Date()
	else
		return new Date(date)
}
