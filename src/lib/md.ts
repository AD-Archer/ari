// security: the source is html-escaped up front and the inline pass is a single
// left-to-right tokenizer, so emitted html is never re-scanned. every url placed in
// href/src must pass safeUrlPattern, and alt text is attribute-escaped.
const safeUrlPattern = /^https?:\/\/[^\s"'<>]+$/i;
const videoExtensionPattern = /\.(mp4|webm|ogg|mov|m4v)(\?\S*)?$/i;
const imageExtensionPattern = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(\?\S*)?$/i;

// the source escape leaves " alone, which would break out of alt="..."
const escapeAttribute = (value: string) => value.replace(/"/g, '&quot;');

function media(url: string, alt: string, forceImage: boolean): string | null {
	if (!safeUrlPattern.test(url)) return null;
	const path = url.split('#')[0];
	if (videoExtensionPattern.test(path))
		return `<video src="${url}" controls preload="metadata" playsinline></video>`;
	if (forceImage || imageExtensionPattern.test(path))
		return `<img src="${url}" alt="${escapeAttribute(alt)}" loading="lazy" referrerpolicy="no-referrer" />`;
	return null;
}

function link(url: string, text: string): string {
	if (!safeUrlPattern.test(url)) return text;
	return `<a href="${url}" target="_blank" rel="noreferrer noopener">${text}</a>`;
}

// no autolinking here: link text must not nest anchors
const emphasis = (text: string): string =>
	text
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>');

// order matters: code, image before link, bold before italic, bare url last
const tokenPattern =
	/(`[^`]+`)|(!\[[^\]]*\]\([^)\s]+\))|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(https?:\/\/[^\s"'<>)]+)/gi;

function inline(text: string): string {
	let html = '';
	let lastIndex = 0;
	for (const match of text.matchAll(tokenPattern)) {
		html += text.slice(lastIndex, match.index);
		const token = match[0];
		if (match[1]) {
			html += '<code>' + token.slice(1, -1) + '</code>';
		} else if (match[2]) {
			const imageMatch = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(token)!;
			html += media(imageMatch[2], imageMatch[1], true) ?? imageMatch[1];
		} else if (match[3]) {
			const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
			html += link(linkMatch[2], emphasis(linkMatch[1]));
		} else if (match[4]) {
			html += '<strong>' + token.slice(2, -2) + '</strong>';
		} else if (match[5]) {
			html += '<em>' + token.slice(1, -1) + '</em>';
		} else {
			// keep trailing sentence punctuation out of the link
			let url = token;
			const trailing = /[.,;:!?)]+$/.exec(url);
			const suffix = trailing ? trailing[0] : '';
			if (suffix) url = url.slice(0, -suffix.length);
			html += (media(url, '', false) ?? link(url, url)) + suffix;
		}
		lastIndex = match.index! + token.length;
	}
	html += text.slice(lastIndex);
	return html;
}

export function renderMd(source: string): string {
	const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const lines = escaped.split('\n');
	let html = '';
	let inList = false;
	let inCode = false;
	let code = '';
	let language = '';
	const closeList = () => {
		if (inList) {
			html += '</ul>';
			inList = false;
		}
	};
	const flushCode = () => {
		const classAttribute = language ? ` class="language-${language}"` : '';
		html += '<pre><code' + classAttribute + '>' + code + '</code></pre>';
		code = '';
		language = '';
		inCode = false;
	};
	for (const line of lines) {
		const fence = /^\s*```(.*)$/.exec(line);
		if (fence) {
			if (inCode) flushCode();
			else {
				closeList();
				inCode = true;
				language = (fence[1].trim().match(/^[\w+-]+/) ?? [''])[0].toLowerCase();
			}
			continue;
		}
		if (inCode) {
			code += (code ? '\n' : '') + line;
			continue;
		}
		if (/^\s*[-*]\s+/.test(line)) {
			if (!inList) {
				html += '<ul>';
				inList = true;
			}
			html += '<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>';
			continue;
		}
		closeList();
		if (/^###\s+/.test(line)) html += '<h4>' + inline(line.replace(/^###\s+/, '')) + '</h4>';
		else if (/^##\s+/.test(line)) html += '<h3>' + inline(line.replace(/^##\s+/, '')) + '</h3>';
		else if (/^#\s+/.test(line)) html += '<h2>' + inline(line.replace(/^#\s+/, '')) + '</h2>';
		else if (line.trim() === '') continue;
		else html += '<p>' + inline(line) + '</p>';
	}
	closeList();
	// an unterminated fence still renders its content
	if (inCode) flushCode();
	return html;
}
