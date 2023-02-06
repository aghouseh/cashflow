import {defineField,defineType} from 'sanity'

export default defineType({
	name: 'recur',
	type: 'object',
	title: 'Event',
	fields: [
		defineField({
			name: 'recurType',
			type: 'string',
			options: {
				list: [
					{
						title: 'Daily',
						value: 'daily'
					},
					{
						title: 'Weekly',
						value: 'weekly'
					},
					{
						title: 'Monthly',
						value: 'monthly'
					},
					{
						title: 'Yearly',
						value: 'yearly'
					}
				]
			}
		}),
		defineField({
			name: 'recurInterval',
			type: 'number',
			title: 'Recur Interval',
			initialValue: 0
		}),
		defineField({
			name: 'maxOccurences',
			type: 'number',
			title: 'Maximum Occurences',
		}),
		defineField({
			name: 'dayOfWeek',
			type: 'day',
			title: 'Day of the Week',
		}),
		defineField({
			name: 'weekOfMonth',
			type: 'number',
			title: 'Week of Month'
		}),
		defineField({
			name: 'dayOfMonth',
			type: 'number',
			title: 'Day of Month'
		}),
		defineField({
			name: 'month',
			type: 'month',
			title: 'Month of Year'
		})
	]
});