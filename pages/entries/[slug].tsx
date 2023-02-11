import { PreviewSuspense } from '@sanity/preview-kit';
import EntryPage from 'components/EntryPage';
import {
	getAllEntryIds,
	getEntryById,
	getSettings
} from 'lib/sanity.client';
import { Entry, Settings } from 'lib/sanity.queries';
import { GetStaticProps } from 'next';
import { lazy } from 'react';

const PreviewPostPage = lazy(() => import('components/PreviewPostPage'));

interface PageProps {
  entry: Entry
  settings?: Settings
  preview: boolean
}

interface Query {
  [key: string]: string
}

interface PreviewData {
  token?: string
}

export default function ProjectSlugRoute(props: PageProps) {
	const { settings, entry, preview } = props;

	// if (preview) {
	//   return (
	//     <PreviewSuspense
	//       fallback={
	//         <EntryPage
	//           loading
	//           preview
	//           entry={}
	//           settings={settings}
	//         />
	//       }
	//     >
	//       <PreviewPostPage
	//         token={token}
	//         entry={entry}
	//         settings={settings}
	//       />
	//     </PreviewSuspense>
	//   )
	// }

	return <EntryPage entry={entry} settings={settings} />;
}

export const getStaticProps: GetStaticProps<
  PageProps,
  Query,
  PreviewData
> = async (ctx) => {
	const { preview = false, previewData = {}, params = {} } = ctx;

	const [settings, entry] = await Promise.all([
		getSettings(),
		getEntryById(params.id),
	]);

	if (!entry) {
		return {
			notFound: true,
		};
	}

	return {
		props: {
			entry,
			settings,
			preview,
		},
	};
};

export const getStaticPaths = async () => {
	const ids = await getAllEntryIds();

	return {
		paths: ids?.map(({ _id }) => `/entries/${_id}`) || [],
		fallback: false,
	};
};
