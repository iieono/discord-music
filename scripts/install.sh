#!/bin/bash

# Discord Music Bot Installation Script for Ubuntu
# Automated setup with security hardening

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BOT_USER="musicbot"
BOT_DIR="/home/$BOT_USER/discord-music-bot"
SERVICE_NAME="musicbot"
NODE_VERSION="18"

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run as root or with sudo"
    exit 1
fi

log "Starting Discord Music Bot installation"

# Update system
log "Updating system packages..."
apt update && apt upgrade -y
if [ $? -ne 0 ]; then
    error "Failed to update system packages"
    exit 1
fi

# Install required packages
log "Installing required packages..."
apt install -y curl git wget ffmpeg python3-sox libsox-fmt-all libsox-dev fail2ban ufw logrotate
if [ $? -ne 0 ]; then
    error "Failed to install required packages"
    exit 1
fi

# Install Node.js
log "Installing Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt install -y nodejs
if [ $? -ne 0 ]; then
    error "Failed to install Node.js"
    exit 1
fi

# Verify installations
log "Verifying installations..."
node_version=$(node --version)
npm_version=$(npm --version)
ffmpeg_version=$(ffmpeg -version | head -n 1)

log "Node.js: $node_version"
log "npm: $npm_version"
log "FFmpeg: $ffmpeg_version"

# Create bot user
if id "$BOT_USER" &>/dev/null; then
    warn "User $BOT_USER already exists"
else
    log "Creating bot user: $BOT_USER"
    useradd -m -s /bin/bash $BOT_USER
    usermod -aG sudo $BOT_USER
fi

# Configure firewall
log "Configuring firewall..."
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Setup Fail2Ban
log "Configuring Fail2Ban..."
cat > /etc/fail2ban/jail.local << EOF
[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
EOF

systemctl enable fail2ban
systemctl start fail2ban

# Switch to bot user
log "Setting up bot directory..."
sudo -u $BOT_USER -i << 'EOF'
# Create bot directory
mkdir -p ~/discord-music-bot
cd ~/discord-music-bot

# Create directories
mkdir -p playlists logs

# Download bot files (replace with your actual download method)
# Example: git clone https://github.com/yourusername/discord-music-bot.git .
# Or use wget to download files

# Create .env file template
cat > .env << ENDOFFILE
# Discord Bot Configuration
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here

# Bot Settings
PREFIX=!
DEFAULT_VOLUME=70
MAX_VOLUME=200
AUTO_LEAVE=true
AUTO_LEAVE_TIMEOUT=300000
STAY_IN_CHANNEL=false

# Environment
NODE_ENV=production

# Optional Settings
BACKUP_WEBHOOK=
HEALTH_WEBHOOK=
ENDOFFILE

echo "✅ Bot directory setup complete"
echo "⚠️  Please edit .env file with your bot credentials"
EOF

# Set up log rotation
log "Setting up log rotation..."
cat > /etc/logrotate.d/musicbot << EOF
$BOT_DIR/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 $BOT_USER $BOT_USER
    postrotate
        systemctl reload $SERVICE_NAME || true
    endscript
}
EOF

# Create systemd service
log "Creating systemd service..."
cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Discord Music Bot
After=network.target

[Service]
Type=simple
User=$BOT_USER
WorkingDirectory=$BOT_DIR
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=3
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
EnvironmentFile=$BOT_DIR/.env

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$BOT_DIR/playlists
ReadWritePaths=$BOT_DIR/logs
ProtectHome=true
RemoveIPC=true

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

[Install]
WantedBy=multi-user.target
EOF

# Create maintenance scripts directory
mkdir -p $BOT_DIR/scripts

# Download maintenance scripts
log "Downloading maintenance scripts..."
# Copy scripts from current location to bot directory
cp -r scripts/* $BOT_DIR/scripts/
chown -R $BOT_USER:$BOT_USER $BOT_DIR/scripts
chmod +x $BOT_DIR/scripts/*.sh

# Set up cron jobs for maintenance
log "Setting up maintenance cron jobs..."
sudo -u $BOT_USER crontab - << EOF
# Daily backup at 2 AM
0 2 * * * $BOT_DIR/scripts/backup.sh

# Health check every 30 minutes
*/30 * * * * $BOT_DIR/scripts/healthcheck.sh

# Clean old logs weekly
0 3 * * 0 find $BOT_DIR/logs -name "*.log" -mtime +7 -delete
EOF

# Fix permissions
log "Setting permissions..."
chown -R $BOT_USER:$BOT_USER $BOT_DIR
chmod 755 $BOT_DIR
chmod 600 $BOT_DIR/.env 2>/dev/null || true
chmod +x $BOT_DIR/scripts/*.sh

# Reload systemd
systemctl daemon-reload
systemctl enable $SERVICE_NAME

# Security hardening
log "Applying security hardening..."

# SSH configuration
if [ -f /etc/ssh/sshd_config ]; then
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
    sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
    sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
    systemctl restart sshd
fi

# System updates
cat > /etc/apt/apt.conf.d/50unattended-upgrades << EOF
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESM:${distro_codename}";
};
Unattended-Upgrade::Package-Blacklist {
};
Unattended-Upgrade::Automatic-Reboot "false";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades << EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

# Install unattended-upgrades
apt install -y unattended-upgrades

# Complete
log "Installation complete!"
echo ""
echo "🎉 Next steps:"
echo "1. Upload your bot files to: $BOT_DIR"
echo "2. Edit $BOT_DIR/.env with your bot credentials"
echo "3. Start the bot: systemctl start $SERVICE_NAME"
echo "4. Check status: systemctl status $SERVICE_NAME"
echo "5. View logs: journalctl -u $SERVICE_NAME -f"
echo ""
echo "📁 Important directories:"
echo "  Bot files: $BOT_DIR"
echo "  Playlists: $BOT_DIR/playlists"
echo "  Logs: $BOT_DIR/logs"
echo "  Scripts: $BOT_DIR/scripts"
echo ""
echo "🔧 Useful commands:"
echo "  Start bot: systemctl start $SERVICE_NAME"
echo "  Stop bot: systemctl stop $SERVICE_NAME"
echo "  Restart bot: systemctl restart $SERVICE_NAME"
echo "  Update bot: $BOT_DIR/scripts/update.sh"
echo "  Backup: $BOT_DIR/scripts/backup.sh"
echo "  Health check: $BOT_DIR/scripts/healthcheck.sh"
echo ""
warn "Don't forget to:"
warn "1. Configure your bot token in .env"
warn "2. Set up SSH keys for login"
warn "3. Configure firewall rules as needed"
warn "4. Set up backups for important data"