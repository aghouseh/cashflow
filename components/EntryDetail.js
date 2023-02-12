import Link from "next/link";
export default function EntryDetail({ entry }) {
	return (
		<>
			<div>{entry.title}</div>
			<div>{entry.description}</div>

			<div><Link href="/entries">Back to Entries</Link></div>
		</>
	);
}