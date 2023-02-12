import './global.css';

import SiteHeader from 'components/SiteHeader';
import SiteNavigation from 'components/SiteNavigation';
import { getSettings } from 'lib/sanity.client';

import styles from './layout.module.css';;

export default async function Layout({ children }) {
	const settings = await getSettings();	
	return (
		<html lang="en">
			<head><title>{settings.title}</title></head>			
			<body className={styles.body}>
				<header className={styles.header}>
					<SiteHeader title={settings.title} description={settings.description} />
					<SiteNavigation />
				</header>
				<main className={styles.main}>{ children }</main>
			</body>
		</html>
	);
}
