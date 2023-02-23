import Link from "next/link";
import { formatCurrency } from "utils/currency";

export default function TimelineEntry({ entry }) {
	return (
		<div>
			<Link href={`/entries/${entry.id}`}>
				{entry.title}
			</Link>
			<div>
				Amount: {formatCurrency(entry.amount)}
			</div>
		</div>
	);
}