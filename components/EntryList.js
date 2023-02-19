import Link from 'next/link';

export default function EntryList({ entries }) {
	return (
		<>
			{entries.map((entry) => (
				<div key={entry.id}>
					<Link href={`/entries/${entry.id}`}>
						{entry.title}
					</Link>
				</div>
			))}			
		</>
	);
}