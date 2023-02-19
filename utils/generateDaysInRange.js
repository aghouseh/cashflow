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
	console.log('comparing dates', { date1, date2, first, second});
	return first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();
}

export default function generateDaysInRange(startDate, endDate, steps = 1) {
	const start = toDate(startDate);
	const end = toDate(endDate);
	const dates = [];

	if (start > end) {
		throw new Error('Start date must be before end date.', { startDate, endDate });
	}	

	let currentDate = new Date(startDate);

	while (currentDate <= end) {
		dates.push(new Date(currentDate));
		// Use UTC date to prevent problems with time zones and DST
		currentDate.setUTCDate(currentDate.getUTCDate() + steps);
	}

	return dates;
}