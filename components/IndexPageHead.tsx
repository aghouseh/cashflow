import BlogMeta from 'components/BlogMeta';
import MetaDescription from 'components/MetaDescription';
import { Settings } from 'lib/sanity.queries';
import { description as siteDescription, title as siteTitle } from 'lib/site.data';

export interface IndexPageHeadProps {
  settings: Settings
}

export default function IndexPageHead({ settings }: IndexPageHeadProps) {
	const {
		title = siteTitle,
		description = siteDescription,
		ogImage = {},
	} = settings;
	const ogImageTitle = ogImage?.title;

	return (
		<>
			<title>{title}</title>
			<BlogMeta />
			<MetaDescription value={description} />
			<meta
				property="og:image"
				// Because OG images must have a absolute URL, we use the
				// `VERCEL_URL` environment variable to get the deployment’s URL.
				// More info:
				// https://vercel.com/docs/concepts/projects/environment-variables
				content={`${
					process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''
				}/api/og?${new URLSearchParams({ title: ogImageTitle })}`}
			/>
		</>
	);
}
