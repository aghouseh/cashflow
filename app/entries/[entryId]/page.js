import EntryDetail from 'components/EntryDetail';
import { getEntryById } from 'lib/sanity.client';

export default async function EntryPage({ params }) {
	const entry = await getEntryById(params.entryId);
	return <EntryDetail entry={entry} />;
}
