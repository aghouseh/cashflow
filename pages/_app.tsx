import 'tailwindcss/tailwind.css';

import SiteLayout from 'components/SiteLayout';
import { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
	return (
		<SiteLayout preview={false}>
			<Component {...pageProps} />
		</SiteLayout>
	);
}
