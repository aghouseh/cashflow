import { defineType } from 'sanity'

export default defineType({
	name: 'day',
	type: 'number',
	title: 'Day',
	options: {
		list: [
			{
				value: 1,
				title: 'Monday'
			},
			{
				value: 2,
				title: 'Tuesday'
			},
			{
				value: 3,
				title: 'Wednesday'
			},
			{
				value: 4,
				title: 'Thursday'
			},
			{
				value: 5,
				title: 'Friday'
			},
			{
				value: 6,
				title: 'Saturday'
			},
			{
				value: 7,
				title: 'Sunday'
			},
		]
	}
})
