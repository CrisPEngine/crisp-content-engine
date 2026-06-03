/**
 * Generates CRISP Sidecar PNG icons (16, 32, 48, 128) — no external deps.
 * Run: node scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const NAVY = [0x0f, 0x14, 0x19];
const ACCENT = [0x3d, 0x8b, 0xfd];
const WHITE = [0xe8, 0xed, 0xf4];

function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		c ^= buf[i];
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
	}
	return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const chunk = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(chunk), 0);
	return Buffer.concat([len, chunk, crc]);
}

function setPixel(data, size, x, y, rgb) {
	if (x < 0 || y < 0 || x >= size || y >= size) return;
	const i = (y * size + x) * 4;
	data[i] = rgb[0];
	data[i + 1] = rgb[1];
	data[i + 2] = rgb[2];
	data[i + 3] = 255;
}

function fillCircle(data, size, cx, cy, r, rgb) {
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
				setPixel(data, size, x, y, rgb);
			}
		}
	}
}

/** Simple "C" mark + side accent bar */
function drawIcon(size) {
	const data = Buffer.alloc(size * size * 4, 0);
	const cx = size / 2;
	const cy = size / 2;
	const r = size * 0.38;

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const dx = x - cx;
			const dy = y - cy;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist <= r) {
				setPixel(data, size, x, y, NAVY);
			}
		}
	}

	// C opening (cut out navy on right-center wedge)
	const cutW = size * 0.22;
	for (let y = Math.floor(cy - r * 0.55); y < Math.ceil(cy + r * 0.55); y++) {
		for (let x = Math.floor(cx); x < size; x++) {
			if (x - cx < cutW) setPixel(data, size, x, y, NAVY);
		}
	}

	// Accent rail (sidecar hint)
	const barX = Math.floor(size * 0.78);
	const barW = Math.max(1, Math.floor(size * 0.08));
	for (let y = Math.floor(size * 0.25); y < Math.ceil(size * 0.75); y++) {
		for (let x = barX; x < barX + barW && x < size; x++) {
			setPixel(data, size, x, y, ACCENT);
		}
	}

	// "C" stroke in white
	const stroke = Math.max(1, Math.floor(size * 0.09));
	for (let a = 0.4 * Math.PI; a <= 1.85 * Math.PI; a += 0.02) {
		const px = Math.round(cx + (r - stroke) * Math.cos(a));
		const py = Math.round(cy + (r - stroke) * Math.sin(a));
		fillCircle(data, size, px, py, stroke * 0.55, WHITE);
	}

	fillCircle(data, size, Math.floor(cx - r * 0.15), Math.floor(cy), stroke * 0.4, WHITE);

	return data;
}

function writePng(size) {
	const raw = drawIcon(size);
	const stride = size * 4 + 1;
	const filtered = Buffer.alloc(stride * size);
	for (let y = 0; y < size; y++) {
		const rowStart = y * stride;
		filtered[rowStart] = 0;
		raw.copy(filtered, rowStart + 1, y * size * 4, (y + 1) * size * 4);
	}
	const compressed = deflateSync(filtered);

	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;

	const png = Buffer.concat([
		signature,
		pngChunk('IHDR', ihdr),
		pngChunk('IDAT', compressed),
		pngChunk('IEND', Buffer.alloc(0)),
	]);

	const path = join(outDir, `icon-${size}.png`);
	writeFileSync(path, png);
	console.log('Wrote', path);
}

for (const size of [16, 32, 48, 128]) {
	writePng(size);
}
