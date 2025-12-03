// Improved Node script to normalize WIX_PUBLIC_KEY in .env
// - finds the WIX_PUBLIC_KEY= entry, including cases where the value is multi-line PEM or broken base64
// - converts the PEM to a single-line base64 and replaces the entire block

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env');
const backupPath = envPath + '.bak';

try {
  const original = fs.readFileSync(envPath, 'utf8');
  fs.writeFileSync(backupPath, original);

  const lines = original.split(/\r?\n/);
  let startLine = -1;
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].startsWith('WIX_PUBLIC_KEY=')) { startLine = k; break; }
  }
  if (startLine === -1) {
    console.error('WIX_PUBLIC_KEY not found in .env');
    process.exit(1);
  }

  // Determine the end line for the block: next comment line or next var definition or EOF
  let endLine = lines.length;
  for (let k = startLine + 1; k < lines.length; k++) {
    const l = lines[k];
    // stop on comment lines
    if (l.trim().startsWith('#')) { endLine = k; break; }
    // stop on a new var assignment where '=' is within the first 60 characters (heuristic)
    const eq = l.indexOf('=');
    if (eq !== -1 && eq <= 60 && /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l)) { endLine = k; break; }
    // otherwise this line is considered part of the WIX_PUBLIC_KEY value
  }

  // Build block string as value remainder starting at first line after '='
  let block = '';
  const firstLine = lines[startLine];
  const eqIdx = firstLine.indexOf('=');
  block += firstLine.substring(eqIdx + 1);
  for (let k = startLine + 1; k < endLine; k++) block += '\n' + lines[k];

  // Trim surrounding whitespace
  block = block.trim();

  let pem = null;
  if (block.includes('-----BEGIN')) {
    const b = block.indexOf('-----BEGIN PUBLIC KEY-----');
    const e = block.indexOf('-----END PUBLIC KEY-----');
    if (b >= 0 && e >= 0) pem = block.substring(b, e + '-----END PUBLIC KEY-----'.length);
  }

  let singleLineBase64 = null;
  if (pem) {
    let normalized = pem.trim();
    if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
      normalized = normalized.slice(1, -1);
    }
    normalized = normalized.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    singleLineBase64 = Buffer.from(normalized, 'utf8').toString('base64');
  } else {
    // Treat it as existing base64 broken over lines
    const condensed = block.replace(/\s+/g, '');
    if (/^[A-Za-z0-9+/=]+$/.test(condensed)) {
      singleLineBase64 = condensed;
    }
  }

  if (!singleLineBase64) {
    console.error('Could not derive single-line base64 from existing WIX_PUBLIC_KEY block. Aborting.');
    process.exit(1);
  }

  // Compose new file body
  // Rebuild file from lines
  const outLines = [];
  for (let k = 0; k < startLine; k++) outLines.push(lines[k]);
  outLines.push('WIX_PUBLIC_KEY=' + singleLineBase64);
  for (let k = endLine; k < lines.length; k++) outLines.push(lines[k]);
  const newBody = outLines.join('\n') + '\n';

  fs.writeFileSync(envPath, newBody, 'utf8');
  console.log('WIX_PUBLIC_KEY normalized to single-line base64 in .env (backup at .env.bak)');
  process.exit(0);
} catch (err) {
  console.error('Error while converting WIX_PUBLIC_KEY:', err);
  process.exit(1);
}
