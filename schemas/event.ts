import {defineField,defineType} from 'sanity'

export default defineType({
	name: 'event',
	type: 'object',
	title: 'Event',
	fields: [
		defineField({
			name: 'isActive',
			type: 'boolean',
			title: 'Is Active?',
			initialValue: true
		}),
		defineField({
			name: 'startDate',
			type: 'datetime',
			title: 'Start Date',
		}),
		defineField({
			name: 'endDate',
			type: 'datetime',
			title: 'End Date',
		}),
		defineField({
			name: 'isFullDay',
			type: 'boolean',
			title: 'Is Full Day?',
			initialValue: true
		}),
		defineField({
			name: 'isRecurring',
			type: 'boolean',
			title: 'Is Recurring?',
			initialValue: true
		}),
		defineField({
			name: 'recur',
			type: 'recur',
			hidden: ({ parent }) => !parent?.isRecurring
		}),
	]
});