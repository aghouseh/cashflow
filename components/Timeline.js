import Link from 'next/link';

import generateDaysInRange, { isSameDay } from '../utils/generateDaysInRange';

export default function Timeline({ entries, startDate, endDate }) {
	const dates = generateDaysInRange(startDate, endDate);
	const daysWithEntries = dates.map(date => ({
		date,
		entries: entries.filter(entry => isSameDay(entry, date)),
	}));
	return (
		<>
			{daysWithEntries.map((day, index) => (
				<div key={index}>
					<div>{ day.date.toString() }</div>
					{day.entries.map(entry => (
						<>
							<Link href={`/entries/${entry.id}`}>
								{entry.title}
							</Link>
							<span>{entry.timestamp.toString()}</span>
						</>))}
				</div>
			))}			
		</>
	);
}