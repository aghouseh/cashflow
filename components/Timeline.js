import Link from 'next/link';
import generateRecurringEntriesWithinRange from 'utils/generateRecurringEntriesWithinRange';

import generateDaysInRange, { isSameDay } from '/utils/generateDaysInRange';

function generateEntries({ entries, startDate, endDate }) {
	const generated = entries.map(
		entry => generateRecurringEntriesWithinRange({ entry, startDate, endDate })
	);
	return generated.flat();
}

export default function Timeline({ entries, startDate, endDate }) {
	const dates = generateDaysInRange(startDate, endDate);
	const generatedEntries = generateEntries({ entries, startDate, endDate });
	const daysWithEntries = dates.map(date => ({
		date,
		entries: generatedEntries.filter(entry => isSameDay(entry.timestamp, date)),
	}));
	return (
		<>
			{daysWithEntries.map((day, index) => (
				<div key={index}>
					<h3>{ day.date.toString() }</h3>
					{day.entries.map(event => (
						<>
							<Link href={`/entries/${event.entry.id}`}>
								{event.entry.title}
							</Link>
							<span>{event.timestamp.toString()}</span>
						</>))}
				</div>
			))}			
		</>
	);
}