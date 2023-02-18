import { groq } from 'next-sanity';

const postFields = groq`
  _id,
  title,
  date,
  excerpt,
  coverImage,
  "slug": slug.current,
  "author": author->{name, picture},
`;
const entryFields = groq`
  _id,
  title,
  description,
  amount,
  tags,
  event
`;

export const settingsQuery = groq`*[_type == "settings"][0]`;

// export const indexQuery = groq`
// *[_type == "post"] | order(date desc, _updatedAt desc) {
//   ${postFields}
// }`

export const indexQuery = groq`
*[_type == "entry"] | order(date desc, _updatedAt desc) {
  ${entryFields}
}`;

export const entryRangeQuery = groq`
*[_type == "entry"
  && (
    event.isRecurring
    || (
      dateTime(event.startDate) > dateTime($startDate)
      && dateTime(event.startDate) < dateTime($endDate)
    )
  )
]{
  ${entryFields}
}`;

export const postAndMoreStoriesQuery = groq`
{
  "post": *[_type == "post" && slug.current == $slug] | order(_updatedAt desc) [0] {
    content,
    ${postFields}
  },
  "morePosts": *[_type == "post" && slug.current != $slug] | order(date desc, _updatedAt desc) [0...2] {
    content,
    ${postFields}
  }
}`;

export const postSlugsQuery = groq`
*[_type == "post" && defined(slug.current)][].slug.current
`;

export const entryIdsQuery = groq`
*[_type == "entry"] { _id }
`;


export const postBySlugQuery = groq`
*[_type == "post" && slug.current == $slug][0] {
  ${postFields}
}
`;


export const entryByIdQuery = groq`
*[_type == "entry" && _id == $id][0] {
  ${entryFields}
}
`;


export interface Author {
  name?: string
  picture?: any
}

export interface Post {
  _id: string
  title?: string
  coverImage?: any
  date?: string
  excerpt?: string
  author?: Author
  slug?: string
  content?: any
}

export interface Entry {
  _id: string
  title: string
  description?: string
  amount: number
  tags?: string[]
  excerpt?: string
  event: Event
}

export interface GeneratedEntry extends Entry {
  isGenerated: boolean
  timestamp: Date
}

export interface EntryRange {
	entry: Entry,
	generated: Entry[]
}

export interface Event {
  _id: string
  isActive: boolean
  startDate: string
  endDate?: string
  isFullDay: boolean
  isRecurring: boolean
  recur: Recur
}

export interface Recur {
  recurType: string,
  recurInterval?: number
  maxOccurences?: number
  dayOfWeek?: number
  weekOfMonth?: number
  dayOfMonth?: number
  month?: number
}

export interface Settings {
  title?: string
  description?: any[]
  ogImage?: {
    title?: string
  }
}
