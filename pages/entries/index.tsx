import { PreviewSuspense } from '@sanity/preview-kit';
import IndexPage from 'components/IndexPage';
import { getAllEntries, getSettings } from 'lib/sanity.client';
import { Entry, Settings } from 'lib/sanity.queries';
import { GetStaticProps } from 'next';

interface PageProps {
  entries: Entry[]
  settings: Settings
  preview: boolean
  token: string | null
}

interface Query {
  [key: string]: string
}

interface PreviewData {
  token?: string
}

export default function Page(props: PageProps) {
	const { entries, settings, preview, token } = props;

	if (preview) {
		return (
			<PreviewSuspense
				fallback={
					<IndexPage loading preview entries={entries} settings={settings} />
				}
			>
				<PreviewIndexPage token={token} />
			</PreviewSuspense>
		);
	}

	return <IndexPage entries={entries} settings={settings} />;
}

export const getStaticProps: GetStaticProps<
  PageProps,
  Query,
  PreviewData
> = async (ctx) => {
	const { preview = false, previewData = {} } = ctx;

	const [settings, entries = []] = await Promise.all([
		getSettings(),
		getAllEntries(),
	]);

	return {
		props: {
			entries,
			settings,
			preview,
			token: previewData.token ?? null,
		},
	};
};
