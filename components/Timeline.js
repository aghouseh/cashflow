import { displayDate } from 'utils/date';
import generateDaysInRange, { isSameDay } from 'utils/generateDaysInRange';
import generateRecurringEntriesWithinRange from 'utils/generateRecurringEntriesWithinRange';;
import TimelineDay from 'components/TimelineDay';
import TimelineEntry from 'components/TimelineEntry';

import styles from './Timeline.module.css';
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
		<div className={styles.timeline}>
			{daysWithEntries.map((day, index) => (
				<TimelineDay key={index} day={day.date.getDay()}>
					<h3>{ displayDate(day.date) }</h3>
					{day.entries.map(event => (
						<TimelineEntry key={event.entry.id} entry={event.entry} />
					))}
				</TimelineDay>
			))}			
		</div>
	);
}