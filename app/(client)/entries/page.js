import EntryList from 'components/EntryList';
import { getAllEntries } from 'lib/sanity.client';

export default async function IndexPage() {
	const entries = await getAllEntries();
	return <EntryList entries={entries} />;
}
