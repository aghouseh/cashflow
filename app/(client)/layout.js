import './global.css';

import SiteHeader from 'components/SiteHeader';
import SiteNavigation from 'components/SiteNavigation';

import styles from './layout.module.css';

export default async function Layout({ children }) {
	return (
		<html lang="en">
			<head><title>CashFlow</title></head>			
			<body className={styles.body}>
				<header className={styles.header}>
					<SiteHeader title="CashFlow" />
					<SiteNavigation />
				</header>
				<main className={styles.main}>{ children }</main>
			</body>
		</html>
	);
}
