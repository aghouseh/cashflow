import Link from "next/link";
import formatCurrency from "utils/formatCurrency";

export default function EntryDetail({ entry }) {
	return (
		<>
			<h2>{entry.title}</h2>
			<p>{entry.description}</p>
			<div>{formatCurrency(entry.amount)}</div>

			<div><Link href="/entries">Back to Entries</Link></div>
		</>
	);
}