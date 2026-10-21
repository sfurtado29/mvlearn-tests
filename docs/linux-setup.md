# MVLearn load tests on Linux: setup guide

For running the load tests (browser probes, k6, hybrid) on a Linux machine. Tested commands are
for **Ubuntu 22.04 / 24.04**; other distributions need the equivalent packages.
What the tests do and how to read the results: `docs/load-test.md`.

## 0. What you need

| | Minimum | Why |
|---|---|---|
| OS | Ubuntu 22.04 or 24.04 (64-bit) | |
| CPU | 2 cores + ~1.5 cores per browser | each browser plays video/audio of the course |
| RAM | 4 GB + ~2 GB per browser | |
| Disk | 5 GB free | Node packages + Chromium |
| Network | must reach the test site (HTTPS) | check in step 5 |
| Accounts | from the project owner, in `.env` | never in chat or e-mail |

k6 users are light; the browsers are what need CPU. Keep the machine under 80% CPU (the runner warns).

## 1. System packages

```bash
sudo apt-get update
sudo apt-get install -y curl git unzip tmux ca-certificates gnupg
```

## 2. Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v      # v22.x
npm -v
```

## 3. k6

```bash
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install -y k6
k6 version   # k6 v1.x
```

If the key server is blocked, download the binary instead (pick the latest linux-amd64 release
from https://github.com/grafana/k6/releases):
```bash
curl -fsSL https://github.com/grafana/k6/releases/download/v1.7.1/k6-v1.7.1-linux-amd64.tar.gz | tar -xz
sudo mv k6-v1.7.1-linux-amd64/k6 /usr/local/bin/ && k6 version
```

## 4. The project

Unpack the project you received (it comes **without** `node_modules` and **without** `.env`):
```bash
mkdir -p ~/MVLearn && tar -xzf mvlearn.tgz -C ~      # or: unzip mvlearn.zip -d ~
cd ~/MVLearn
npm ci                                           # installs the exact package versions
npx playwright install --with-deps chromium      # Chromium + its Linux libraries (uses sudo)
npx playwright --version                         # Version 1.63.0
```

## 5. The `.env` file (credentials)

Get the values from the project owner through a safe channel. Never commit `.env` or paste it in chat.
```bash
cp .env.example .env
nano .env        # fill in, then Ctrl+O, Enter, Ctrl+X
chmod 600 .env   # only you can read it
```

Lines the load tests need:
```
TARGET=staging                                  # or dev
BASE_URL=...                                    # dev site
APP_USERNAME=...
APP_PASSWORD="..."
STAGING_BASE_URL=...                            # staging site
STAGING_APP_USERNAME=...
STAGING_APP_PASSWORD="..."
LOAD_PROBE_POOL="user1:pass1;user2:pass2"       # accounts for the BROWSERS
LOAD_K6_POOL="user3:pass3"                      # accounts for k6 (never the same as above)
LOAD_ALLOW_HOST=                                # only for a non-staging site, e.g. dev-mvlearn.verificient.com
```
- Put the whole value in **double quotes** if a password contains `#` (otherwise everything after
  `#` is ignored).
- A username must appear in only one pool.

Check, without running any test:
```bash
node --input-type=module -e "await import('./target.js'); console.log('site:', new URL(process.env.BASE_URL).hostname, '| allowed:', process.env.LOAD_ALLOW_HOST || '(staging needs none)')"
curl -sI "https://$(node --input-type=module -e "await import('./target.js'); console.log(new URL(process.env.BASE_URL).hostname)")/login/index.php" | head -1   # must show 200
LOAD_PROBE_RUN=1 npx playwright test --list --project=user --no-deps --grep @load-probe   # lists one "probe <user>" per account
```
If `curl` does not show `200`, the site blocks this machine: ask for its public IP
(`curl -s ifconfig.me`) to be allowed.

## 6. Running

Run inside **tmux**, so the test keeps going if the terminal or SSH session closes:
```bash
tmux new -s load          # start a session (later: tmux attach -t load)
cd ~/MVLearn
# ... run a command below ...
# leave it running: Ctrl+B, then D
```

**One run at a time**, and a **new `LOAD_RUN_ID` every time** (the results folder; reusing a name
overwrites it). Settings go in front of the command, only for that run:

| What | Command | Takes |
|---|---|---|
| Baseline: 1 browser, no extra load | `LOAD_PROBES=1 LOAD_STEP=baseline-1 LOAD_RUN_ID=linux-baseline-1_run1 npm run load:probe` | ~31 min |
| k6 check: 1 k6 user, 5 min | `LOAD_K6_VUS=1 LOAD_STEP=k6-check LOAD_RUN_ID=linux-k6-check_run1 LOAD_K6_DURATION=5m npm run load:k6` | ~7 min |
| Hybrid: 1 k6 user + 1 browser | `LOAD_K6_VUS=1 LOAD_PROBES=1 LOAD_STEP=hybrid-2 LOAD_RUN_ID=linux-hybrid-2_run1 LOAD_BASELINE=linux-baseline-1_run1 npm run load:hybrid` | ~35 min |
| Hybrid: 8 k6 users + 2 browsers | `LOAD_K6_VUS=8 LOAD_PROBES=2 LOAD_STEP=hybrid-10 LOAD_RUN_ID=linux-hybrid-10_run1 LOAD_BASELINE=linux-baseline-2_run1 npm run load:hybrid` | ~35 min |

What the settings mean:

| Setting | Meaning |
|---|---|
| `LOAD_PROBES` | number of real browsers (first N accounts of `LOAD_PROBE_POOL`) |
| `LOAD_K6_VUS` | number of k6 "fake learners" (from `LOAD_K6_POOL`) |
| `LOAD_STEP` | a label stored in the results |
| `LOAD_RUN_ID` | results folder: `test-logs/load/<LOAD_RUN_ID>/` |
| `LOAD_BASELINE` | an earlier browser-only run to compare with (same number of browsers, same machine) |
| `LOAD_K6_DURATION` | k6 alone only: how long to keep the load |

Compare only runs made **from the same machine** (a Linux run against a Linux baseline): network
distance changes the timings.

## 7. Results

```bash
ls test-logs/load/
cat test-logs/load/linux-hybrid-2_run1/summary.md      # browsers: times per step, vs baseline
cat test-logs/load/linux-hybrid-2_run1/k6-summary.md   # server: time per request type
```
| File | Content |
|---|---|
| `summary.md` | browser: completion, saves, resume, errors, time per step (p50 / p95 / max), comparison |
| `k6-summary.md` | k6: login/player/saves OK, requests, time per request type, errors |
| `machine.json` | this machine's CPU and RAM during the run |
| `probe-<user>.json` | every timing of one browser |

Send results back by copying the run folder (no `.env` inside it).

## 8. Good to know

- The **first Linux run** is also the first time the course plays in Linux Chromium. The slides only
  move on when their narration ends; if a probe gets stuck on a slide, send the console output.
- On **staging**, Log out redirects to the DMV sign-on (`wsi2st.dmv.ca.gov`), which answered 403 from
  our network. The tests handle it and list it under "errors from other websites"; it is a known
  finding, not a failure of your setup.
- Stop a run: attach to tmux (`tmux attach -t load`) and press Ctrl+C. The hybrid runner then also
  stops k6.
- After code changes from the project owner: replace the files and run `npm ci` again.
