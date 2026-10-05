export const daysAgo = (days: number, hourOfDay = 15) => {
	const date = new Date(Date.now() - days * 86400000); // ms in a day: 24 * 60 * 60 * 1000
	date.setUTCHours(hourOfDay, 0, 0, 0);
	return date;
};

export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000); // ms in a minute: 60 * 1000

// a fixed utc hour on day zero can land in the future or on yesterday's local date, so
// "today" rows sit a short while before now instead: 20 minutes per step
export const recentOrDaysAgo = (days: number, step = 3) =>
	days === 0 ? minutesAgo(step * 20) : daysAgo(days, step);

export const sumOf = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
