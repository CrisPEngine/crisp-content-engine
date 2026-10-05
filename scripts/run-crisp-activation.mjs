import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

function load(file, env) {
	let text = '';
	try {
		text = readFileSync(file, 'utf8');
	} catch {
		return;
	}
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq < 1) continue;
		const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
		if (value) env[key] = value;
	}
}

const env = { ...process.env };
load('.env.local', env);
load('/tmp/cce-crisp-run.env', env);
mkdirSync('/tmp', { recursive: true });
const script = process.argv[2] || 'scripts/activate-crisp-digital.ts';
const outFile = process.argv[3] || '/tmp/cce-crisp-activation.json';
const child = spawn('npx', ['--yes', 'tsx', '--tsconfig', 'tsconfig.json', script], {
	env,
	stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
let err = '';
child.stdout.on('data', (chunk) => { out += chunk; });
child.stderr.on('data', (chunk) => { err += chunk; });
child.on('exit', (code) => {
	writeFileSync(outFile, out);
	if (err.trim()) process.stderr.write(err);
	process.exit(code ?? 1);
});
