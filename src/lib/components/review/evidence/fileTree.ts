import type { FileHour } from '$lib/review/reviewTypes';

export interface FileLeaf {
	name: string;
	row: FileHour;
}

export interface DirectoryNode {
	name: string;
	path: string;
	directories: DirectoryNode[];
	files: FileLeaf[];
	seconds: number;
}

const emptyDirectory = (name: string, path: string): DirectoryNode => ({
	name,
	path,
	directories: [],
	files: [],
	seconds: 0
});

export function buildFileTree(rows: FileHour[]): DirectoryNode {
	const root = emptyDirectory('', '');
	// a map, so a directory called "constructor" cannot collide with an object key
	const byPath = new Map<string, DirectoryNode>([['', root]]);
	const directoryFor = (path: string): DirectoryNode => {
		const known = byPath.get(path);
		if (known) return known;
		const cut = path.lastIndexOf('/');
		const parent = directoryFor(cut >= 0 ? path.slice(0, cut) : '');
		const node = emptyDirectory(path.slice(cut + 1), path);
		parent.directories.push(node);
		byPath.set(path, node);
		return node;
	};
	for (const row of rows) {
		const cut = row.path.lastIndexOf('/');
		directoryFor(cut >= 0 ? row.path.slice(0, cut) : '').files.push({
			name: row.path.slice(cut + 1),
			row
		});
	}
	const total = (node: DirectoryNode): number => {
		node.directories.sort((first, second) => first.name.localeCompare(second.name));
		node.files.sort((first, second) => first.name.localeCompare(second.name));
		node.seconds =
			node.files.reduce((sum, file) => sum + file.row.seconds, 0) +
			node.directories.reduce((sum, directory) => sum + total(directory), 0);
		return node.seconds;
	};
	total(root);
	// a chain of directories with one child each reads as one row: "src/lib" instead of two levels
	const compact = (node: DirectoryNode) => {
		node.directories = node.directories.map((directory) => {
			let folded = directory;
			while (folded.directories.length === 1 && folded.files.length === 0) {
				const only = folded.directories[0];
				only.name = `${folded.name}/${only.name}`;
				folded = only;
			}
			compact(folded);
			return folded;
		});
	};
	compact(root);
	return root;
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`; // 1024 * 1024 bytes
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`; // 1024 bytes in a kilobyte
	return `${bytes} B`;
}
