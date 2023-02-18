import { PortableText } from '@portabletext/react';
import Link from 'next/link';

import styles from './SiteHeader.module.css';

export default function SiteHeader({
	title,
	description,
	level = 1,
}: {
  title: string
  description?: string | any[]
  level: 1 | 2
}) {
	switch (level) {
	case 1:
		return (
			<header>
				<h1>
					<a href="/">{title}</a>
				</h1>
				<h4 className={styles.portableText}>
					<PortableText value={description} />
				</h4>
			</header>
		);

	case 2:
		return (
			<header>
				<h2>
					<Link href="/">
						{title}
					</Link>
				</h2>
			</header>
		);

	default:
		throw new Error(
			`Invalid level: ${
				JSON.stringify(level) || typeof level
			}, only 1 or 2 are allowed`
		);
	}
}
