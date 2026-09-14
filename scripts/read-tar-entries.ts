/**
 * Reads a gzipped tar in memory, without extracting anything to disk.
 *
 * The point of the verification this feeds is to find out what a tarball contains *before* anyone
 * can run it; unpacking it first would mean writing those very files somewhere. POSIX tar is
 * regular enough to walk directly: 512-byte header blocks, each followed by the file's content
 * padded up to the next 512-byte boundary.
 */
export type TarEntry = {
	name: string;
	size: number;
	bytes: Uint8Array;
};

const blockSize = 512;

function readString(block: Uint8Array, offset: number, length: number): string {
	const raw = block.subarray(offset, offset + length);
	const end = raw.indexOf(0);

	return new TextDecoder().decode(end === -1 ? raw : raw.subarray(0, end)).trim();
}

function readOctal(block: Uint8Array, offset: number, length: number): number {
	const text = readString(block, offset, length);

	return text.length === 0 ? 0 : Number.parseInt(text, 8);
}

export function readTarEntries(archive: Uint8Array): TarEntry[] {
	const entries: TarEntry[] = [];
	let cursor = 0;

	while (cursor + blockSize <= archive.length) {
		const header = archive.subarray(cursor, cursor + blockSize);

		// Two consecutive zero blocks end the archive; one is enough to stop reading.
		if (header.every((byte) => byte === 0)) {
			break;
		}

		const name = readString(header, 0, 100);
		const size = readOctal(header, 124, 12);
		const typeFlag = readString(header, 156, 1);
		const prefix = readString(header, 345, 155);
		const contentStart = cursor + blockSize;

		// "0" and "" are both a regular file; anything else (directory, link, pax header) carries no
		// content worth inspecting.
		if (typeFlag === "0" || typeFlag === "") {
			entries.push({
				name: prefix.length > 0 ? `${prefix}/${name}` : name,
				size,
				bytes: archive.subarray(contentStart, contentStart + size),
			});
		}

		cursor = contentStart + Math.ceil(size / blockSize) * blockSize;
	}

	return entries;
}
