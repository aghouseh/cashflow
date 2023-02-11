import Container from 'components/BlogContainer';
import IndexPageHead from 'components/IndexPageHead';
import SiteHeader from 'components/SiteHeader';
import Layout from 'components/SiteLayout';
import type { Entry, Settings } from 'lib/sanity.queries';
import { description as siteDescription, title as siteTitle } from 'lib/site.data';
import Head from 'next/head';
import Link from 'next/link';
export interface IndexPageProps {
  preview?: boolean
  loading?: boolean
  entries: Entry[]
  settings: Settings
}

export default function IndexPage(props: IndexPageProps) {
	const { preview, loading, entries = [], settings } = props;
	const { title = siteTitle, description = siteDescription } = settings || {};

	return (
		<>
			<Head>
				<IndexPageHead settings={settings} />
			</Head>
			<Layout preview={preview} loading={loading}>
				<Container>
					<SiteHeader title={title} description={description} level={1} />
					{entries.map((entry) => (
						<div key={entry._id}>
							<Link href={`/entries/${entry._id}`}>
								{entry.title}
							</Link>
						</div>
					))}
				</Container>
			</Layout>
		</>
	);
}
