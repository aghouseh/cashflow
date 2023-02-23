export function formatCurrency(number) {
	if (isNaN(number)) {
		return number;
	}

	return new Intl.NumberFormat('en-US' || navigator.language, {
		style: 'currency',
		currency: 'USD',
	}).format(number);
}
