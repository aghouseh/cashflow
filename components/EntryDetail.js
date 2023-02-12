import Link from "next/link";
import formatCurrency from "utils/formatCurrency";

export default function EntryDetail({ entry }) {
	return (
		<>
			<div>{entry.title}</div>
			<div>{entry.description}</div>
			<div>{formatCurrency(entry.amount)}</div>

			<div><Link href="/entries">Back to Entries</Link></div>
		</>
	);
}