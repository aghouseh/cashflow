const ONE_DAY = 24* 60 * 60 * 1000;

export function toDate(date) {
	return date instanceof Date ? date : new Date(date);
}

export function isEarlierDate(date1, date2) {
	return toDate(date1) <= toDate(date2);
}

export function isSameDay(date1, date2) {
	const first = toDate(date1);
	const second = toDate(date2);
	return first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();
}

export default function generateDaysInRange(startDate, endDate) {
	const start = toDate(startDate);
	const end = toDate(endDate);
	if (start > end) {
		throw new Error('Start date must be before end date.', { startDate, endDate });
	}
	const dates = [];
	let current = start;

	while (current <= end) {
		if (isEarlierDate(current, end)) {
			dates.push(current);
			current.setDate(current.getDate() + 1);
		}
	}

	return dates;
}