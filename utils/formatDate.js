export default function formatDate(incomingDate) {
	const date = new Date(incomingDate);
	return date.toISOString();
}

