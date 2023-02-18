import { apiVersion, dataset, projectId, useCdn } from 'lib/sanity.api';
import {
	type Entry,
	entryByIdQuery,
	entryIdsQuery,
	entryRangeQuery,
	type GeneratedEntry,
	indexQuery,
	type Settings,
	settingsQuery
} from 'lib/sanity.queries';
import { createClient } from 'next-sanity';

/**
 * Checks if it's safe to create a client instance, as `@sanity/client` will throw an error if `projectId` is false
 */
const client = createClient({ projectId, dataset, apiVersion, useCdn });

export async function getSettings(): Promise<Settings> {
	return await client.fetch(settingsQuery);
}

export async function getAllEntryIds(): Promise<Pick<Entry, '_id'>[]> {
	const ids = (await client.fetch<string[]>(entryIdsQuery)) || [];
	return ids.map((_id) => ({ _id }));
}


export async function getEntryById(id: string): Promise<Entry> {
	return (await client.fetch(entryByIdQuery, { id })) || ({} as any);
}

export async function getAllEntries(): Promise<Entry[]> {
	return (await client.fetch(indexQuery)) || [];
}

function formatDate(incomingDate: string | Date) {
	const date = new Date(incomingDate);
	const [dateString] = date.toISOString().split('T');
	return dateString;
}

export function generateRecurringEntriesWithinRange({
	entry,
	startDate,
	endDate,
}: {
	entry: Entry,
	startDate: Date | string,
	endDate: Date | string,
}): GeneratedEntry[] {
	const entries = [{
		...entry,
		isGenerated: true,
		timestamp: new Date(entry.event.startDate),
	}];
	//TODO: generate them derp
	return entries;
}

export async function getEntriesWithinRange(startDate: Date | string, endDate: Date | string): Promise<GeneratedEntry[]> {
	const startDateObj = new Date(startDate);
	const endDateObj = new Date(endDate);
	const entries = await client.fetch(entryRangeQuery, {
		 startDate: formatDate(startDateObj),
		 endDate: formatDate(endDateObj),
	});

	const generated = entries.map(
		entry => generateRecurringEntriesWithinRange({ entry, startDate, endDate })
	);

	return generated.flat();
}