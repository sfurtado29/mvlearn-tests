#!/usr/bin/env bash
# Samples this machine every 5 s while a load test runs (docs/load-test.md, "Server checks"), so the
# test's timings can be lined up with what the server was doing. Needs no sudo, changes nothing.
# Use it on the Moodle server and on the k6 machine (to prove the load generator was not the limit).
#
# Usage:  bash server-monitor.sh start | stop | status
# Logs:   ~/loadmon/<start time>/  server.log (one line per 5 s), vmstat.log, iostat.log (if installed)
set -u
SELF=$(readlink -f "$0")
BASE="$HOME/loadmon"
PIDS="$BASE/.pids"

sample() {
  echo "# $(hostname), $(nproc) CPUs, times in $(date '+%Z (%z)')"
  echo "# time      load1 load5 running/total mem_avail_mb php_fpm apache web_conns db_conns_in db_conns_out"
  while :; do
    read -r l1 l5 _ rt _ < /proc/loadavg
    mem=$(awk '/^MemAvailable/ {print int($2 / 1024)}' /proc/meminfo)
    fpm=$(pgrep -c php-fpm 2>/dev/null)
    apache=$(pgrep -c apache2 2>/dev/null)
    web=$(ss -Htn state established '( sport = :443 or sport = :80 )' 2>/dev/null | wc -l)
    db_in=$(ss -Htn state established '( sport = :3306 or sport = :5432 )' 2>/dev/null | wc -l)
    db_out=$(ss -Htn state established '( dport = :3306 or dport = :5432 )' 2>/dev/null | wc -l)
    echo "$(date +%T)  $l1 $l5 $rt $mem ${fpm:-0} ${apache:-0} $web $db_in $db_out"
    sleep 5
  done
}

case "${1:-}" in
  start)
    mkdir -p "$BASE"
    if [ -s "$PIDS" ]; then echo "Already running: bash $SELF stop first."; exit 1; fi
    DIR="$BASE/$(date +%Y-%m-%d_%H-%M-%S)"
    mkdir -p "$DIR"
    nohup vmstat -n -t 5 > "$DIR/vmstat.log" 2>&1 < /dev/null &
    echo $! >> "$PIDS"
    if command -v iostat >/dev/null 2>&1; then
      nohup iostat -xt 5 > "$DIR/iostat.log" 2>&1 < /dev/null &
      echo $! >> "$PIDS"
    fi
    nohup bash "$SELF" _sample > "$DIR/server.log" 2>&1 < /dev/null &
    echo $! >> "$PIDS"
    echo "$DIR" > "$BASE/.dir"
    echo "Monitoring started: $DIR"
    ;;
  stop)
    if [ ! -s "$PIDS" ]; then echo "Not running."; exit 0; fi
    kill $(cat "$PIDS") 2>/dev/null
    rm -f "$PIDS"
    echo "Monitoring stopped. Logs: $(cat "$BASE/.dir")"
    ;;
  status)
    if [ -s "$PIDS" ]; then
      echo "Running, logs in $(cat "$BASE/.dir"):"
      tail -3 "$(cat "$BASE/.dir")/server.log"
    else
      echo "Not running."
    fi
    ;;
  _sample) sample ;;
  *) echo "Usage: bash $SELF start | stop | status"; exit 1 ;;
esac
