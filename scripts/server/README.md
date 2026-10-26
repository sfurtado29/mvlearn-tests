# MVLearn load test: server checks

Three small scripts for the MVLearn load test. They show how the servers are set up and what they
are doing while the test runs, so slow spots in the test results can be traced to a cause.

**Safe to run:** they only read. No sudo needed, nothing is installed or changed, and passwords
or keys are never printed. Each script is plain text: read it first if you like.

| Script | Run on | What it does | Time |
|---|---|---|---|
| `moodle-check.sh` | Moodle server | Writes a report: machine size, PHP-FPM, web server, database, cache, Moodle settings, cron | ~1 min, once |
| `k6-check.sh` | k6 machine | Writes a report: machine size, limits, k6/Docker, network path to the site | ~1 min, once |
| `server-monitor.sh` | Both | Records CPU load, memory, PHP workers and connections every 5 s while a test runs | Duration of the test |

## 1. Copy the scripts to the server

From your PC (PowerShell or a terminal), in the folder with the scripts. Our server uses port 2222:
note `-P` (capital) for scp, `-p` for ssh.

```
scp -P 2222 moodle-check.sh server-monitor.sh <login>@<server>:~/
```

**If scp does not work** (some gateways allow only an interactive login): open
`paste-into-ssh.txt`, copy all of it, log in, and paste it into the SSH window. It creates all
three scripts in `~/mvlearn/` and ends with "MVLearn scripts ready". Then run them from there,
e.g. `bash ~/mvlearn/moodle-check.sh`.

## 2. Run the check (once per server)

```
bash ~/moodle-check.sh                                    # on the Moodle server
MOODLE_DIR=/path/to/moodle bash ~/moodle-check.sh         # if it says "Moodle folder not found"
bash ~/k6-check.sh                                        # on the k6 machine
```

It prints the report and saves it as `~/mvlearn-check-<type>-<host>-<date>.txt`.

## 3. During a load test (when asked)

```
bash ~/server-monitor.sh start      # just before the test starts
bash ~/server-monitor.sh status     # any time: shows the last few samples
bash ~/server-monitor.sh stop       # right after the test ends
```

It keeps running if you log out. Logs go to `~/loadmon/<start time>/`.

## 4. Send back

- `~/mvlearn-check-*.txt`
- the `~/loadmon/` folder (after a test), e.g. `tar -czf ~/loadmon.tar.gz -C ~ loadmon`

To copy them to your PC: `scp -P 2222 "<login>@<server>:~/mvlearn-check-*.txt" .` (or, if scp is
not available, `cat` the file and copy the text from the terminal).

The reports describe the server (versions, settings, sizes, internal addresses) but contain no
passwords. Share them through internal channels only.
