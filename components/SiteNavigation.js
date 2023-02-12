import Link from 'next/link';

import styles from './SiteNavigation.module.css';

export default function SiteNavigation() {
	return <nav className={styles.nav}>
		<ul>
			<li>
				<Link href="/entries">Entries</Link>
			</li>
		</ul>
	</nav>;
}
