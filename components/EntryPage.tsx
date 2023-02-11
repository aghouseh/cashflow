import SiteHeader from 'components/SiteHeader';
import type { Entry, Settings } from 'lib/sanity.queries';
import { description as siteDescription, title as siteTitle } from 'lib/site.data';

export interface EntryPageProps {
  preview?: boolean
  loading?: boolean
  entry: Entry
  settings: Settings
}

export default function EntryPage(props: EntryPageProps) {
	const { entry, settings } = props;
	const { title = siteTitle } = settings || {};

	return (
		<>
			<SiteHeader title={entry.title || title} level={2} />
			<article>
				{/* <span>{{ entry.title }}</span> */}
			</article>
		</>
	);
}
