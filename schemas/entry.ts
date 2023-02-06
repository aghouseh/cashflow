import {defineField,defineType} from 'sanity'

export default defineType({
	name: 'entry',
	type: 'document',
	title: 'Entry',
	fields: [
		defineField({
			name: 'title',
			type: 'string',
		}),
		defineField({
			name: 'description',
			type: 'string',
		}),
		defineField({
			name: 'amount',
			type: 'number'
		}),
		defineField({
		  title: 'Tags',
		  name: 'tags',
		  type: 'array',
		  of: [{ type: 'string' }],
		  options: {
		    layout: 'tags'
		  }
		}),
		defineField({
			name: 'event',
			type: 'event',
		}),
	]
});
