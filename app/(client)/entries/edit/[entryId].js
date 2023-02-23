import EntryForm from 'components/EntryForm';
import { getEntryById } from 'data/entry';

export default async function EntryEditPage({ params }) {
	const entry = await getEntryById(params.entryId);
	return <EntryForm entry={entry} />;
}