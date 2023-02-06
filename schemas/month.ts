import { defineType } from 'sanity'

export default defineType({
	name: 'month',
	type: 'number',
	title: 'Month',
	options: {
		list: [
			{
				value: 1,
				title: 'January'
			},
			{
				value: 2,
				title: 'February'
			},
			{
				value: 3,
				title: 'March'
			},
			{
				value: 4,
				title: 'April'
			},
			{
				value: 5,
				title: 'May'
			},
			{
				value: 6,
				title: 'June'
			},
			{
				value: 7,
				title: 'July'
			},
			{
				value: 8,
				title: 'August'
			},
			{
				value: 9,
				title: 'September'
			},
			{
				value: 10,
				title: 'October'
			},
			{
				value: 11,
				title: 'November'
			},
			{
				value: 12,
				title: 'December'
			},
		]
	}
})
