'use client';

import Timeline from 'components/Timeline';
import { getEntriesWithinRange } from 'lib/sanity.client';
import { use, useState } from 'react';

const startDate = new Date();
const endDate = new Date();
endDate.setDate(endDate.getDate() + 30);

export default function TimelinePage() {
	// const [startDate, setStartDate] = useState(new Date());
	// const [endDate, setEndDate] = useState(new Date(startDate.getDate() + 30));
	
	const entries = use(getEntriesWithinRange(startDate, endDate));
	const sortedEntries = entries.sort((entry1, entry2) => entry1.timestamp - entry2.timestamp);
	return <Timeline entries={sortedEntries} startDate={startDate} endDate={endDate} />;
}
