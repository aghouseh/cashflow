import Link from 'next/link';

export default function EntryList({ entries }) {
	return (
		<>
			{entries.map((entry) => (
				<div key={entry._id}>
					<Link href={`/entries/${entry._id}`}>
						{entry.title}
					</Link>
				</div>
			))}			
		</>
	);
}