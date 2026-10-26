#!/usr/bin/env bash
# Read-only check of the Moodle server's setup for the load test (docs/load-test.md, "Server checks").
# Needs no sudo: anything it cannot read is reported as such. Changes nothing, installs nothing and
# never prints passwords.
#
# Usage (on the Moodle server):  bash moodle-check.sh              (finds the Moodle folder itself)
#                                MOODLE_DIR=/var/www/moodle bash moodle-check.sh
# Report: ~/mvlearn-check-moodle-<host>-<date>.txt
set -u
OUT="$HOME/mvlearn-check-moodle-$(hostname)-$(date +%Y-%m-%d_%H-%M).txt"
exec > >(tee "$OUT") 2>&1

section() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section "Access"
date '+%F %T %Z (%z)'
whoami; id
if sudo -n true 2>/dev/null; then echo "sudo: yes (not used by this script)"; else echo "sudo: no, or needs a password"; fi

section "Machine"
hostnamectl 2>/dev/null | grep -E 'Operating|Kernel|Virtualization|Hardware' || grep PRETTY_NAME /etc/os-release
timedatectl 2>/dev/null | grep -E 'Time zone|synchronized'
echo "CPUs: $(nproc)"; lscpu | grep -E 'Model name'
free -h
df -hT -x tmpfs -x devtmpfs -x squashfs -x overlay
lsblk -d -o NAME,SIZE,ROTA,TYPE 2>/dev/null   # ROTA 0 = SSD
mount | grep -E ' type (nfs|nfs4|cifs|fuse)' || echo "No network file systems mounted."
uptime
gcp=$(curl -s -m 2 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/machine-type 2>/dev/null)
if [ -n "$gcp" ]; then
  zone=$(curl -s -m 2 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/zone)
  echo "GCP machine type: ${gcp##*/}, zone: ${zone##*/}"
fi

section "Running services"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null \
  | grep -E 'php|nginx|apache|httpd|mysql|maria|postgres|redis|memcache|pgbouncer|proxysql|varnish|haproxy' \
  || echo "(none of the usual services found by systemctl)"
echo
echo "Processes (name, count, total RAM):"
ps -eo comm=,rss= | awk '{m[$1]+=$2; n[$1]++} END {for (p in m) printf "  %-18s %4d  %7d MB\n", p, n[p], m[p]/1024}' | sort -k3 -rn | head -15
echo
echo "Listening TCP ports (3306 MySQL/MariaDB, 5432 PostgreSQL, 6379 Redis, 11211 Memcached, 9000 PHP-FPM, 6432 PgBouncer):"
ss -Htln 2>/dev/null | awk '{print "  " $4}' | sort -u

section "PHP"
have php && php -v | head -1
PHPV=$(ps -eo comm= | grep -oE '^php-fpm[0-9.]+' | head -1 | sed 's/php-fpm//')
[ -z "$PHPV" ] && have php && PHPV=$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')
echo "Version in use: ${PHPV:-unknown}; installed: $(ls /etc/php 2>/dev/null | tr '\n' ' ')"
if [ -n "$PHPV" ] && [ -d "/etc/php/$PHPV" ]; then
  echo; echo "PHP-FPM pool (/etc/php/$PHPV/fpm/pool.d):"
  grep -hE '^\s*(listen|pm|pm\.[a-z_]+|request_terminate_timeout|php_admin_value\[memory_limit\])\s*=' /etc/php/"$PHPV"/fpm/pool.d/*.conf 2>/dev/null \
    | sed 's/^\s*/  /' || echo "  (not readable, or PHP does not run as PHP-FPM)"
  for sapi in fpm apache2; do
    [ -f "/etc/php/$PHPV/$sapi/php.ini" ] || continue
    echo; echo "php.ini settings ($sapi):"
    grep -hE '^\s*(memory_limit|max_execution_time|post_max_size|upload_max_filesize|max_input_vars|session\.save_handler|opcache\.(enable|memory_consumption|max_accelerated_files|validate_timestamps|revalidate_freq|interned_strings_buffer))\s*=' \
      "/etc/php/$PHPV/$sapi/php.ini" /etc/php/"$PHPV"/"$sapi"/conf.d/*.ini 2>/dev/null | sed 's/^\s*/  /'
  done
  if have "php-fpm$PHPV"; then
    echo; echo "Effective PHP-FPM values:"
    timeout 10 "php-fpm$PHPV" -i 2>/dev/null \
      | grep -E '^(memory_limit|max_execution_time|opcache\.enable|opcache\.memory_consumption|opcache\.validate_timestamps|opcache\.revalidate_freq) =>' | sed 's/^/  /'
  fi
fi
echo; echo "PHP-FPM workers now: $(pgrep -c php-fpm 2>/dev/null)"
ps -C "php-fpm$PHPV" -o rss= 2>/dev/null | awk '{n++; s+=$1} END {if (n) printf "Average RAM per worker: %d MB\n", s/n/1024}'

section "Web server"
have nginx && nginx -v 2>&1
if [ -d /etc/nginx ]; then
  grep -rhE '^\s*(worker_processes|worker_connections|worker_rlimit_nofile|keepalive_timeout|keepalive_requests|gzip|brotli|http2|fastcgi_read_timeout|proxy_read_timeout|client_max_body_size|log_format|access_log)\b' /etc/nginx/ 2>/dev/null \
    | sed 's/^\s*//' | sort | uniq -c
fi
have apache2ctl && apache2ctl -v 2>/dev/null | head -1
if [ -d /etc/apache2 ]; then
  echo "Apache modules: $(ls /etc/apache2/mods-enabled 2>/dev/null | grep -E '^(mpm_|php|deflate|brotli|http2|expires)' | grep '\.load$' | tr '\n' ' ')"
  grep -rhE '^\s*(StartServers|ServerLimit|MaxRequestWorkers|ThreadsPerChild|MaxConnectionsPerChild|KeepAlive|KeepAliveTimeout|MaxKeepAliveRequests|Timeout|LogFormat)\b' /etc/apache2/ 2>/dev/null \
    | sed 's/^\s*//' | sort | uniq -c
fi
echo; echo "Logs readable by $(whoami)?"
for f in /var/log/nginx/access.log /var/log/nginx/error.log /var/log/apache2/access.log /var/log/apache2/error.log; do
  [ -e "$f" ] || continue
  if [ -r "$f" ]; then echo "  yes  $f ($(du -h "$f" | cut -f1))"; else echo "  no   $f"; fi
done

section "Database"
have mysql && mysql --version
have psql && psql --version
[ -d /etc/mysql ] && grep -rhE '^\s*(max_connections|innodb_buffer_pool_size|innodb_log_file_size|innodb_redo_log_capacity|innodb_flush_log_at_trx_commit|slow_query_log|slow_query_log_file|long_query_time|bind-address)\b' /etc/mysql/ 2>/dev/null | sed 's/^\s*/  /'
for f in /etc/postgresql/*/main/postgresql.conf; do
  [ -r "$f" ] || continue
  echo "$f:"
  grep -hE '^\s*(max_connections|shared_buffers|work_mem|effective_cache_size|log_min_duration_statement|log_lock_waits|shared_preload_libraries|listen_addresses)\b' "$f" | sed 's/^\s*/  /'
done
if ! pgrep -x mysqld >/dev/null && ! pgrep -x mariadbd >/dev/null && ! pgrep -x postgres >/dev/null; then
  echo "No database runs on this machine: see dbhost in the Moodle section."
fi

section "Cache and sessions"
if have redis-cli; then
  timeout 3 redis-cli INFO server 2>&1 | grep -E 'redis_version|NOAUTH'
  timeout 3 redis-cli INFO memory 2>/dev/null | grep -E '^(used_memory_human|maxmemory_human|maxmemory_policy)'
  timeout 3 redis-cli INFO clients 2>/dev/null | grep -E '^connected_clients'
fi
[ -r /etc/redis/redis.conf ] && grep -E '^\s*(maxmemory|maxmemory-policy|bind|requirepass)\b' /etc/redis/redis.conf | sed -E 's/(requirepass).*/\1 (set)/'
[ -r /etc/memcached.conf ] && grep -E '^-(m|c|l|t)\b' /etc/memcached.conf
have redis-cli || [ -r /etc/memcached.conf ] || echo "No Redis or Memcached found on this machine."

section "Moodle"
MOODLE_DIR=${MOODLE_DIR:-}
if [ -z "$MOODLE_DIR" ]; then
  setup=$(find /var/www /srv /opt /home -maxdepth 5 -path '*/lib/setup.php' 2>/dev/null | head -1)
  if [ -n "$setup" ]; then
    MOODLE_DIR=$(dirname "$(dirname "$setup")")
    # Moodle 5.1+ keeps the code in public/ and config.php one level up.
    [ ! -e "$MOODLE_DIR/config.php" ] && [ -e "$MOODLE_DIR/../config.php" ] && MOODLE_DIR=$(dirname "$MOODLE_DIR")
  fi
fi
DATAROOT=
if [ -z "$MOODLE_DIR" ]; then
  echo "Moodle folder not found or not readable. Run again with: MOODLE_DIR=/path/to/moodle bash moodle-check.sh"
else
  echo "Moodle folder: $MOODLE_DIR"
  grep -hE '^\s*\$(release|version|branch)\s*=' "$MOODLE_DIR/version.php" "$MOODLE_DIR/public/version.php" 2>/dev/null | sed 's/^\s*/  /'
  CONFIG="$MOODLE_DIR/config.php"
  if [ -r "$CONFIG" ]; then
    echo "config.php (passwords and keys left out):"
    grep -E '\$CFG->(dbtype|dblibrary|dbhost|dbname|prefix|wwwroot|dataroot|session_handler_class|session_redis_host|session_memcached_save_path|debug|debugdisplay|perfdebug|localcachedir|tempdir|cachedir|sslproxy|reverseproxy)\b|dbport|dbsocket|dbpersist' "$CONFIG" \
      | grep -viE 'pass|secret|key|auth' | sed 's/^\s*/  /'
    DATAROOT=$(grep -oP "CFG->dataroot\s*=\s*'\K[^']+" "$CONFIG")
  else
    echo "config.php not readable by $(whoami): $(ls -l "$CONFIG" 2>&1)"
  fi
fi
if [ -n "$DATAROOT" ]; then
  echo; echo "moodledata: $DATAROOT"
  df -hT "$DATAROOT" 2>/dev/null | sed 's/^/  /'
  if [ -r "$DATAROOT/muc/config.php" ]; then
    echo "Cache stores (muc/config.php):"
    grep -E "'(plugin|class)' =>" "$DATAROOT/muc/config.php" | sed 's/^\s*//' | sort | uniq -c
  else
    echo "  muc/config.php not readable (normal without the web server's group)"
  fi
fi

section "Cron and scheduled jobs"
ls /etc/cron.d 2>/dev/null | tr '\n' ' '; echo
grep -rshiE 'moodle|admin/cli/cron' /etc/cron.d /etc/crontab 2>/dev/null
systemctl list-timers --all --no-pager 2>/dev/null | grep -i moodle
crontab -l 2>/dev/null | grep -i moodle

section "System limits"
echo "Open files (this user): $(ulimit -n)"
for k in net.core.somaxconn net.ipv4.tcp_max_syn_backlog net.ipv4.ip_local_port_range fs.file-max vm.swappiness; do
  printf '  %-30s %s\n' "$k" "$(tr '\t' ' ' < "/proc/sys/${k//.//}" 2>/dev/null)"
done
swapon --show 2>/dev/null | grep -q . && swapon --show || echo "No swap."

section "Resource history (sysstat)"
if have sar && ls /var/log/sysstat/sa[0-9]* >/dev/null 2>&1; then
  echo "Available days: $(ls /var/log/sysstat/ | tr '\n' ' ')"
  echo "Example: sar -u -q -r -f /var/log/sysstat/sa15 -s 13:00:00 -e 14:00:00"
else
  echo "Not available (sysstat not installed or not collecting)."
fi

section "Done"
echo "Report saved: $OUT"
