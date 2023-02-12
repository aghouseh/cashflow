import EntryDetail from 'components/EntryDetail';
import { getEntryById } from 'lib/sanity.client';

export const revalidate = 60; // revalidate this page every 60 seconds

export default async function EntryPage({ params }) {
	const entry = await getEntryById(params.entryId);
	return <EntryDetail entry={entry} />;
}
