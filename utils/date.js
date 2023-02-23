export function formatDate(incomingDate) {
	return new Date(incomingDate).toISOString();
}

export function displayDate(incomingDate, format = null) {
	return new Date(incomingDate).toDateString();
}