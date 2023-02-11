import { apiVersion, dataset, projectId, useCdn } from 'lib/sanity.api';
import {
	type Entry,
	entryByIdQuery,
	entryIdsQuery,
	indexQuery,
	type Post,
	postAndMoreStoriesQuery,
	postBySlugQuery,
	postSlugsQuery,
	type Settings,
	settingsQuery,
} from 'lib/sanity.queries';
import { createClient } from 'next-sanity';

/**
 * Checks if it's safe to create a client instance, as `@sanity/client` will throw an error if `projectId` is false
 */
const client = createClient({ projectId, dataset, apiVersion, useCdn });

export async function getSettings(): Promise<Settings> {
	return await client.fetch(settingsQuery);
}

export async function getAllPosts(): Promise<Post[]> {
	return await client.fetch(indexQuery);
}

export async function getAllPostsSlugs(): Promise<Pick<Post, 'slug'>[]> {
	const slugs = (await client.fetch<string[]>(postSlugsQuery)) || [];
	return slugs.map((slug) => ({ slug }));
}

export async function getPostBySlug(slug: string): Promise<Post> {
	return (await client.fetch(postBySlugQuery, { slug })) || ({} as any);
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

