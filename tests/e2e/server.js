// fork-only, dev-only: starts copyparty from this checkout's source for the end-to-end tests.
// 127.0.0.1 only, on a free port, every folder and database in a fresh temp dir; the fork's
// tested config (FORK.md) plus grants and the fork's file-browser scripts; seeded files,
// one grant and one share link. Playwright's globalSetup runs it once per test run and
// calls the function it returns to stop the server and delete the temp dir.
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');

// the accounts of the tested config in FORK.md, plus dave, who has no home folder
const ACCOUNTS = {
    admin: 'adminpw1', alice: 'alicepw1', bob: 'bobpw111', carol: 'carolpw1', dave: 'davepw11',
};

// accounts a scenario may log out: a logout ends every session of that account, so each
// worker running at the same time gets its own (fixture logoutUser, by parallelIndex)
const LOGOUT_USERS = [];
for (let i = 0; i < 16; i++) {
    LOGOUT_USERS.push(`out${i}`);
    ACCOUNTS[`out${i}`] = `outpw${100 + i}`;
}

// a share link alice made of her /home/alice/trip/ folder
const SHARE_KEY = 'e2etripshare01';

// seeded files, relative to the temp dir's srv/
const SEED = {
    'home/alice/notes.txt': 'shopping: milk, eggs\n',
    'home/alice/trip/budget.xlsx': 'not really a spreadsheet\n',
    'home/alice/proj/plan.txt': 'step 1: start\n',
    'home/bob/todo.txt': 'fix the bike\n',
    'family/recipes.txt': 'pancakes\n',
    'common/welcome.txt': 'hello everyone\n',
};

function conf(tmp, port) {
    const d = (p) => path.join(tmp, p);
    return `[global]
  i: 127.0.0.1
  name: e2eparty
  p: ${port}
  e2dsa
  shr: /share
  chpw
  usernames
  grants: /shared
  js-browser: /.cpr/w/fork-browser.js
  js-other: /.cpr/w/ctlpanel.js
  wram
  hist: ${d('hist')}
  shr-db: ${d('db/shares.db')}
  grants-db: ${d('db/grants.db')}
  ses-db: ${d('db/sessions.db')}
  chpw-db: ${d('db/chpw.json')}

[groups]
  family: alice, bob
  nohome: dave

[accounts]
${Object.entries(ACCOUNTS).map(([u, p]) => `  ${u}: ${p}`).join('\n')}

[/home/\${u%-nohome}]
  ${d('srv/home')}/\${u%-nohome}
  accs:
    A: \${u}
    a: admin

[/family]
  ${d('srv/family')}
  accs:
    rwmd: @family
    A: admin

[/common]
  ${d('srv/common')}
  accs:
    r: @acct
    A: admin
`;
}

// the main checkout's venv; agent worktrees have none of their own (as in fork-check.sh)
function python() {
    if (process.env.CPP_PYTHON)
        return process.env.CPP_PYTHON;
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
        cwd: REPO,
        encoding: 'utf8',
    }).trim();
    const py = path.join(path.dirname(common), '.venv', 'bin', 'python');
    if (!fs.existsSync(py))
        throw new Error(`no ${py}; create it as in CLAUDE.md (Commands), or set CPP_PYTHON`);
    return py;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.unref();
        s.on('error', reject);
        s.listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a logged-in session for one account: { get, post } with its cookie
async function session(base, user) {
    const fd = new FormData();
    fd.append('act', 'login');
    fd.append('uname', user);
    fd.append('cppwd', ACCOUNTS[user]);
    const r = await fetch(base + '/?h', { method: 'POST', body: fd, redirect: 'manual' });
    const cookie = (r.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
    if (!/cppwd=/.test(cookie))
        throw new Error(`login as ${user} set no cookie (status ${r.status})`);
    const req = (method, url, body, type) =>
        fetch(base + url, {
            method,
            body,
            headers: Object.assign({ Cookie: cookie }, type ? { 'Content-Type': type } : {}),
            redirect: 'manual',
        });
    return {
        get: (url) => req('GET', url),
        put: (url, body) => req('PUT', url, body),
        postJson: (url, obj) => req('POST', url, JSON.stringify(obj), 'application/json'),
    };
}

async function expectStatus(r, want, what) {
    if (r.status !== want)
        throw new Error(`${what}: status ${r.status}, ${(await r.text()).trim()}`);
    return r;
}

async function start() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-e2e-'));
    for (const [rel, body] of Object.entries(SEED)) {
        const p = path.join(tmp, 'srv', rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, body);
    }
    for (const u of Object.keys(ACCOUNTS))
        fs.mkdirSync(path.join(tmp, 'srv', 'home', u), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'db'));

    const port = await freePort();
    const cfg = path.join(tmp, 'e2e.conf');
    fs.writeFileSync(cfg, conf(tmp, port));

    const log = path.join(tmp, 'copyparty.log');
    const fd = fs.openSync(log, 'a');
    const proc = spawn(python(), ['-m', 'copyparty', '-c', cfg], {
        cwd: REPO,
        stdio: ['ignore', fd, fd],
        env: Object.assign({}, process.env, { PRTY_NO_VIPS: '1' }),
    });
    fs.closeSync(fd);

    let exited = null;
    proc.on('exit', (code, sig) => (exited = sig || code));
    const kill = () => {
        if (exited === null)
            proc.kill('SIGTERM');
    };
    const clean = () => {
        if (!process.env.E2E_KEEP)
            fs.rmSync(tmp, { recursive: true, force: true });
    };
    // also when the run is cut short before the teardown. Nothing can be awaited here, so
    // wait for the kill in a blocking loop: copyparty still writing its hist/ while it shuts
    // down would put folders back into the temp dir after the rm
    process.on('exit', () => {
        if (exited === null) {
            proc.kill('SIGKILL');
            const nap = new Int32Array(new SharedArrayBuffer(4));
            for (let i = 0; i < 40; i++) {
                let st = '';
                try {
                    st = fs.readFileSync(`/proc/${proc.pid}/stat`, 'utf8');
                } catch (e) {
                    if (e.code === 'ENOENT')
                        break;  // gone (or no /proc: then this waits the full 2 s)
                }
                if (/^\d+ \(.*\) Z/.test(st))
                    break;  // dead, not yet reaped
                Atomics.wait(nap, 0, 0, 50);
            }
        }
        clean();
    });

    const stop = async () => {
        kill();
        for (let i = 0; i < 50 && exited === null; i++)
            await sleep(100);
        if (exited === null)
            proc.kill('SIGKILL');
        if (process.env.E2E_KEEP)
            console.log(`e2e: kept ${tmp}`);
        clean();
    };

    const base = `http://127.0.0.1:${port}`;
    try {
        for (let i = 0; ; i++) {
            if (exited !== null)
                throw new Error(`copyparty exited (${exited})`);
            if (i > 300)
                throw new Error('copyparty did not answer within 30 s');
            try {
                if ((await fetch(base + '/?ls')).status)
                    break;
            } catch (e) {
                // not listening yet
            }
            await sleep(100);
        }

        const alice = await session(base, 'alice');
        let r = await alice.postJson('/?grant', {
            vp: '/home/alice/proj/', rcpt: 'bob', name: 'proj', perms: ['read'],
        });
        await expectStatus(r, 201, 'seeding the grant');
        r = await alice.postJson('/?share', {
            k: SHARE_KEY, vp: ['/home/alice/trip/'], pw: '', exp: '', perms: ['read', 'get'],
        });
        await expectStatus(r, 201, 'seeding the share link');
    } catch (e) {
        const out = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').slice(-30).join('\n') : '';
        await stop();
        throw new Error(`${e.message}\n--- copyparty log (last lines) ---\n${out}`);
    }

    process.env.E2E_BASE = base;
    process.env.E2E_SHARE = `${base}/share/${SHARE_KEY}/`;
    console.log(`e2e: copyparty on ${base} (log ${log})`);
    return stop;
}

module.exports = start;
module.exports.ACCOUNTS = ACCOUNTS;
module.exports.SEED = SEED;
module.exports.LOGOUT_USERS = LOGOUT_USERS;
module.exports.session = session;
