import EntryDetail from 'components/EntryDetail';
import { getEntryById } from 'data/entry';

export default async function EntryPage({ params }) {
	const entry = await getEntryById(params.entryId);
	return <EntryDetail entry={entry} />;
}
