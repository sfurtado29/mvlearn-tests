#!/usr/bin/env bash
# Read-only check of the k6 / load-generator machine (docs/load-test.md, "Server checks"): its size,
# its limits, and how it reaches the site. Needs no sudo, changes nothing.
#
# Usage (on the k6 machine):  bash k6-check.sh [site host]     (default dev-mvlearn.verificient.com)
# Report: ~/mvlearn-check-k6-<host>-<date>.txt
set -u
SITE=${1:-dev-mvlearn.verificient.com}
OUT="$HOME/mvlearn-check-k6-$(hostname)-$(date +%Y-%m-%d_%H-%M).txt"
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
df -hT / "$HOME" 2>/dev/null
uptime
gcp=$(curl -s -m 2 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/machine-type 2>/dev/null)
if [ -n "$gcp" ]; then
  zone=$(curl -s -m 2 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/zone)
  ext=$(curl -s -m 2 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
  echo "GCP machine type: ${gcp##*/}, zone: ${zone##*/}, external IP: ${ext:-none}"
fi

section "Load-test tools"
have k6 && k6 version || echo "k6 not installed"
have docker && docker --version || echo "docker not installed"
have node && echo "node $(node -v)" || echo "node not installed"

section "Limits"
echo "Open files (this user): $(ulimit -n)   (k6 needs well above 2 x VUs; 10000+ is safe)"
echo "Processes (this user): $(ulimit -u)"
for k in net.ipv4.ip_local_port_range net.ipv4.tcp_tw_reuse net.core.somaxconn fs.file-max; do
  printf '  %-30s %s\n' "$k" "$(tr '\t' ' ' < "/proc/sys/${k//.//}" 2>/dev/null)"
done

section "Network to $SITE"
ip -4 -br addr 2>/dev/null
IP=$(getent ahostsv4 "$SITE" | awk 'NR==1 {print $1}')
echo "$SITE resolves to: ${IP:-nothing}"
case "$IP" in
  10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*)
    echo "→ Private address: this machine reaches the site over an internal network, faster than real learners." ;;
esac
[ -n "$IP" ] && ip route get "$IP" 2>/dev/null | head -1
echo; echo "Three timed requests to the login page:"
for i in 1 2 3; do
  curl -so /dev/null -m 30 -w '  dns %{time_namelookup}s  connect %{time_connect}s  tls %{time_appconnect}s  first byte %{time_starttransfer}s  total %{time_total}s  http %{http_code}\n' \
    "https://$SITE/login/index.php"
done
echo; echo "Response headers (proxy/CDN, compression, PHP version if exposed):"
curl -sI -m 30 -H 'Accept-Encoding: gzip, br' "https://$SITE/login/index.php" \
  | grep -iE '^(http|server|x-powered-by|via|cf-|x-cache|content-encoding|alt-svc|strict-transport)' | sed 's/^/  /'
if have tracepath; then
  echo; echo "Route (up to 15 hops):"
  timeout 30 tracepath -n -m 15 "$SITE" 2>/dev/null | sed 's/^/  /'
fi

section "Done"
echo "Report saved: $OUT"
