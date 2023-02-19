import EntryList from 'components/EntryList';
import { getAllEntries } from 'data/entry';

export default async function IndexPage() {
	const entries = await getAllEntries();
	return <EntryList entries={entries} />;
}
