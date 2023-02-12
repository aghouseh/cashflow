'use client';

import EntryList from 'components/EntryList';
import { getEntriesWithinRange } from 'lib/sanity.client';
import { use, useState } from 'react';

export default function TimelinePage() {
	const [startDate, setStartDate] = useState(new Date());
	const entries = use(getEntriesWithinRange({
		startDate,
	}));
	
	return <EntryList entries={entries} />;
}
