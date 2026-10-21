#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu VM (GCP Compute Engine) for the load tests: installs Docker.
# Everything else (Node, Chromium, k6) lives in the image built by scripts/gcp/load.sh.
# Usage, on the VM, inside the copied project folder:  bash scripts/gcp/setup-vm.sh
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl
  curl -fsSL https://get.docker.com | sudo sh
fi

# Let this user run docker without sudo (takes effect after logging out and in again).
sudo usermod -aG docker "$USER" || true

# Many browsers open many files and processes.
if ! grep -q "mvlearn-load" /etc/security/limits.conf; then
  echo "# mvlearn-load" | sudo tee -a /etc/security/limits.conf >/dev/null
  echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf >/dev/null
  echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf >/dev/null
fi

mkdir -p test-logs test-results

echo
echo "Done. Log out and back in (so 'docker' works without sudo), then:"
echo "  1. Create .env in this folder (copy from your PC; never commit it)."
echo "  2. bash scripts/gcp/load.sh probe     # see docs/load-test.md for the variables"
echo
echo "This VM: $(nproc) vCPU, $(free -g | awk '/Mem:/ {print $2}') GB RAM."
echo "Rule of thumb: one browser probe needs ~1.5 vCPU and ~1.7 GB; k6 users are light."
