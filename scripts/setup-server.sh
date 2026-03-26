#!/bin/bash
# ============================================================
#  HIDEYOU — Server Setup Script
#  Run ONCE on a fresh Ubuntu/Debian VPS before install.sh
#  Usage: bash scripts/setup-server.sh
# ============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}  →${RESET}  $*"; }
success() { echo -e "${GREEN}${BOLD}  ✓${RESET}  $*"; }
step()    { echo -e "\n${BOLD}══ $* ${RESET}"; }

[[ $EUID -ne 0 ]] && { echo "Run as root: sudo bash scripts/setup-server.sh"; exit 1; }

step "System update"
apt-get update -qq && apt-get upgrade -y -qq
success "System updated"

step "Essential packages"
apt-get install -y -qq \
  curl wget git unzip vim htop \
  ufw fail2ban logrotate \
  ca-certificates gnupg lsb-release
success "Packages installed"

step "Firewall (UFW)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable
success "Firewall configured"

step "Fail2ban — brute force protection"
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s
backend  = %(sshd_backend)s

[nginx-req-limit]
enabled  = true
filter   = nginx-req-limit
logpath  = /var/log/nginx/error.log
maxretry = 10
EOF
systemctl enable fail2ban --quiet
systemctl restart fail2ban
success "Fail2ban configured"

step "SSH hardening"
# Disable password auth if key is present
if [[ -f ~/.ssh/authorized_keys ]]; then
  sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/'  /etc/ssh/sshd_config
  systemctl reload sshd
  success "SSH password auth disabled"
else
  info "No authorized_keys found — skipping SSH hardening (add your key first!)"
fi

step "System limits for Docker"
cat >> /etc/sysctl.conf << 'EOF'
# HIDEYOU optimizations
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_fin_timeout = 15
vm.swappiness = 10
fs.file-max = 2097152
EOF
sysctl -p --quiet
success "Kernel parameters set"

step "Swap (2GB)"
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  success "Swap created"
else
  info "Swap already exists, skipping"
fi

step "Logrotate for HIDEYOU"
cat > /etc/logrotate.d/hideyou << 'EOF'
/var/log/hideyou-*.log {
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  sharedscripts
}
EOF
success "Logrotate configured"

step "Project directory"
mkdir -p /opt/hideyou
chown -R "$SUDO_USER:$SUDO_USER" /opt/hideyou 2>/dev/null || true
success "Created /opt/hideyou"

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  Server setup complete!${RESET}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════${RESET}"
echo ""
echo -e "  Next steps:"
echo -e "  ${CYAN}1.${RESET} cd /opt/hideyou"
echo -e "  ${CYAN}2.${RESET} git clone <your-repo> ."
echo -e "  ${CYAN}3.${RESET} sudo bash install.sh"
echo ""
