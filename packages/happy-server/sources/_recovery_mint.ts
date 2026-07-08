// TEMP recovery tool — mint a fresh auth token via the server's OWN auth module,
// validate it against /v1/machines, and (only if valid) inject into access.key.
// Deleted after recovery. See parthenogenesis happy-seat thread / secret-rotation recovery.
import { auth } from '@/app/auth/auth';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const userId = process.argv[2];
const serverUrl = process.env.HAPPY_SERVER_URL || 'http://localhost:3005';
const home = process.env.USERPROFILE || process.env.HOME || '';
const keyFile = join(home, '.happy-selfhost', 'access.key');
const doInject = process.argv.includes('--inject');

async function main() {
    if (!userId) throw new Error('usage: _recovery_mint.ts <userId> [--inject]');

    await auth.init();
    const token = await auth.createToken(userId);

    // Validate against the exact endpoint the daemon hits, with this exact token.
    const res = await fetch(`${serverUrl}/v1/machines`, {
        headers: { 'Authorization': `Bearer ${token}`, 'X-Happy-Client': 'cli-recovery/1' }
    });
    const ok = res.status === 200;
    let count: number | string = '?';
    try {
        const j: any = await res.json();
        count = Array.isArray(j) ? j.length : (j?.machines ? j.machines.length : JSON.stringify(j).slice(0, 60));
    } catch { /* ignore */ }
    const iat = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).iat;
    console.log(`VALIDATE GET /v1/machines -> HTTP ${res.status} ${ok ? 'OK' : 'FAIL'}  machines=${count}  tokenFp=${token.slice(0, 14)}…  iat=${iat} (${new Date(iat * 1000).toISOString()})`);

    if (!ok) { console.log('RESULT: validation FAILED — nothing touched.'); process.exit(2); }
    if (!doInject) { console.log('RESULT: valid. (dry-run; pass --inject to write access.key)'); process.exit(0); }

    const bak = keyFile + '.pre-mint-bak';
    copyFileSync(keyFile, bak);
    const cred = JSON.parse(readFileSync(keyFile, 'utf8'));
    cred.token = token;
    writeFileSync(keyFile, JSON.stringify(cred, null, 2));
    console.log(`RESULT: INJECTED into access.key (encryption preserved, token swapped). Backup: ${bak}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('ERR:', e?.message || e); process.exit(1); });
