import Link from 'next/link';

export default function SiteNavigation() {
	return <nav>
		<ul>
			<li>
				<Link href="/entries">Entries</Link>
			</li>
		</ul>
	</nav>;
}
