import Link from 'next/link';

import generateDaysInRange, {isSameDay} from '../utils/generateDaysInRange';

export default function Timeline({ entries, startDate, endDate }) {
	const dates = generateDaysInRange(startDate, endDate);
	const daysWithEntries = dates.map(date => {
		const dayEntries = entries.filter(entry => {
			return isSameDay(entry.timestamp, date);
		});
		return {
			date,
			entries: dayEntries,
		};
	});
	return (
		<>
			{daysWithEntries.map((day) => (
				<div key={day.date.toUTCString()}>
					<div>{ day.date.toString() }</div>
					{day.entries.map(entry => (
						<>
							<Link href={`/entries/${entry._id}`}>
								{entry.title}
							</Link>
							<span>{entry.timestamp.toString()}</span>
						</>))}
				</div>
			))}			
		</>
	);
}