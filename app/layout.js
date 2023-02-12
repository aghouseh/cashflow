import SiteHeader from 'components/SiteHeader';
import SiteNavigation from 'components/SiteNavigation';
import { getSettings } from 'lib/sanity.client';


export default async function Layout({ children }) {
	const settings = await getSettings();	
	return (
		<html lang="en">
			<head><title>{settings.title}</title></head>			
			<body className="bg-white text-black">
				<header>
					<SiteHeader title={settings.title} description={settings.description} />
					<SiteNavigation />
				</header>
				<main>{ children }</main>
			</body>
		</html>
	);
}
