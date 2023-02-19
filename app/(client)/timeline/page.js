import Timeline from 'components/Timeline';
import { getEntriesWithinRange } from 'data/entry';
import { use } from 'react';

const startDate = new Date();
const endDate = new Date();
endDate.setDate(endDate.getDate() + 30);

export default function TimelinePage() {
	const entries = use(getEntriesWithinRange(startDate, endDate));
	const sortedEntries = entries.sort((entry1, entry2) => entry1.timestamp - entry2.timestamp);
	return <Timeline entries={sortedEntries} startDate={startDate} endDate={endDate} />;
}
