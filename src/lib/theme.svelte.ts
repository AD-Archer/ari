import { browser } from '$app/environment';

function createTheme() {
	// dark is the default: only an explicit 'light' choice opts out, matching the script in app.html
	let dark = $state(!browser || localStorage.getItem('ari-theme') !== 'light');

	return {
		get dark() {
			return dark;
		},
		toggle() {
			dark = !dark;
			if (!browser) return;
			localStorage.setItem('ari-theme', dark ? 'dark' : 'light');
			document.documentElement.classList.toggle('dark', dark);
		}
	};
}

export const theme = createTheme();
