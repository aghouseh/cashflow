export default function generateRecurringEntriesWithinRange({
	entry,
	startDate,
	endDate,
}) {
	const entries = [{
		...entry,
		isGenerated: true,
		timestamp: new Date(entry.startDate),
	}];
	//TODO: generate them derp
	return entries;
}

