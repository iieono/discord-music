#!/bin/bash
# Ubuntu Service Setup Script for Discord Music Bot

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BOT_USER="musicbot"
SERVICE_NAME="musicbot"
INSTALL_DIR="/opt/discord-music-bot"

echo -e "${BLUE}🎵 Discord Music Bot - Ubuntu Service Setup${NC}"
echo ""

# Check if root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Run with sudo${NC}"
    exit 1
fi

# Stop existing service
if systemctl is-active --quiet $SERVICE_NAME; then
    echo -e "${YELLOW}⏹️ Stopping existing service${NC}"
    systemctl stop $SERVICE_NAME
fi

# Update system
echo -e "${BLUE}📦 Updating system...${NC}"
apt update
apt upgrade -y

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
apt install -y curl git ffmpeg python3-sox libsox-fmt-all fail2ban

# Install Node.js 18
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 18 ]]; then
    echo -e "${BLUE}📥 Installing Node.js 18...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
fi

# Create bot user if doesn't exist
if ! id "$BOT_USER" &>/dev/null; then
    echo -e "${BLUE}👤 Creating bot user...${NC}"
    useradd -r -s /bin/false -d /opt/discord-music-bot $BOT_USER
fi

# Create directories
echo -e "${BLUE}📁 Creating directories...${NC}"
mkdir -p $INSTALL_DIR/{playlists,logs,scripts}
chown -R $BOT_USER:$BOT_USER $INSTALL_DIR
chmod 755 $INSTALL_DIR

# Copy bot files
echo -e "${BLUE}📂 Installing bot files...${NC}"
# Copy all files except .git and node_modules
rsync -av --progress --exclude=.git --exclude=node_modules --exclude=.env ./ $INSTALL_DIR/
chown -R $BOT_USER:$BOT_USER $INSTALL_DIR

# Install dependencies
echo -e "${BLUE}📦 Installing Node.js dependencies...${NC}
sudo -u $BOT_USER npm ci --production --prefix $INSTALL_DIR

# Get bot configuration
echo ""
echo -e "${YELLOW}⚙️ Bot Configuration${NC}"
read -p "Enter Discord Bot Token: " DISCORD_TOKEN
read -p "Enter Discord Client ID: " DISCORD_CLIENT_ID

# Create .env file
echo -e "${BLUE}📝 Creating configuration...${NC}"
cat > $INSTALL_DIR/.env << EOF
DISCORD_TOKEN=$DISCORD_TOKEN
DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID
PREFIX=!
DEFAULT_VOLUME=70
MAX_VOLUME=200
AUTO_LEAVE=true
AUTO_LEAVE_TIMEOUT=300000
STAY_IN_CHANNEL=false
NODE_ENV=production
REQUEST_DELAY=1000
MAX_RETRIES=3
EOF

chmod 600 $INSTALL_DIR/.env
chown $BOT_USER:$BOT_USER $INSTALL_DIR/.env

# Create systemd service
echo -e "${BLUE}⚙️ Creating systemd service...${NC}"
cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Discord Music Bot
After=network.target

[Service]
Type=simple
User=$BOT_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
EnvironmentFile=$INSTALL_DIR/.env

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$INSTALL_DIR/playlists
ReadWritePaths=$INSTALL_DIR/logs
ProtectHome=true
RemoveIPC=true

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

# Logging
StandardOutput=file:$INSTALL_DIR/logs/bot.log
StandardError=file:$INSTALL_DIR/logs/error.log

[Install]
WantedBy=multi-user.target
EOF

# Create log rotation
echo -e "${BLUE}📊 Setting up log rotation...${NC}"
cat > /etc/logrotate.d/$SERVICE_NAME << EOF
$INSTALL_DIR/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 $BOT_USER $BOT_USER
    postrotate
        systemctl reload-or-restart $SERVICE_NAME || true
    endscript
}
EOF

# Create maintenance scripts
echo -e "${BLUE}🔧 Creating maintenance scripts...${NC}"

# Backup script
cat > $INSTALL_DIR/scripts/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/musicbot"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup playlists
tar -czf "$BACKUP_DIR/playlists_$DATE.tar.gz" -C $(dirname $0)/../ playlists 2>/dev/null

# Backup config
cp $(dirname $0)/../.env "$BACKUP_DIR/config_$DATE.env" 2>/dev/null

# Keep only 30 days of backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
find "$BACKUP_DIR" -name "config_*.env" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

# Update script
cat > $INSTALL_DIR/scripts/update.sh << 'EOF'
#!/bin/bash
SERVICE_NAME="musicbot"
INSTALL_DIR="/opt/discord-music-bot"

echo "Updating Discord Music Bot..."

# Create backup first
$INSTALL_DIR/scripts/backup.sh

# Stop service
systemctl stop $SERVICE_NAME

# Pull latest changes
cd $INSTALL_DIR
git pull origin main

# Update dependencies
npm ci --production

# Fix permissions
chown -R musicbot:musicbot $INSTALL_DIR

# Start service
systemctl start $SERVICE_NAME

echo "Update complete!"
EOF

# Health check script
cat > $INSTALL_DIR/scripts/healthcheck.sh << 'EOF'
#!/bin/bash
SERVICE_NAME="musicbot"
LOG_FILE="/opt/discord-music-bot/logs/health.log"

echo "[$(date)] Health check started" >> $LOG_FILE

if systemctl is-active --quiet $SERVICE_NAME; then
    # Check memory usage
    PID=$(pgrep -f "node index.js")
    if [ -n "$PID" ]; then
        MEMORY_KB=$(ps -p $PID -o rss= | tail -1)
        MEMORY_MB=$((MEMORY_KB / 1024))
        echo "[$(date)] Memory usage: ${MEMORY_MB}MB" >> $LOG_FILE
        
        if [ $MEMORY_MB -gt 500 ]; then
            echo "[$(date)] WARNING: High memory usage" >> $LOG_FILE
        fi
    fi
    
    # Check if responding to Discord
    UPTIME=$(systemctl show $SERVICE_NAME --property=ActiveEnterTimestamp | cut -d= -f2-)
    echo "[$(date)] Service uptime: $UPTIME" >> $LOG_FILE
else
    echo "[$(date)] ERROR: Service not running" >> $LOG_FILE
    systemctl restart $SERVICE_NAME
fi

echo "[$(date)] Health check completed" >> $LOG_FILE
EOF

# Make scripts executable
chmod +x $INSTALL_DIR/scripts/*.sh
chown $BOT_USER:$BOT_USER $INSTALL_DIR/scripts

# Setup cron jobs
echo -e "${BLUE}⏰ Setting up cron jobs...${NC}"
cat > /etc/cron.d/musicbot << EOF
# Daily backup at 2 AM
0 2 * * * $BOT_USER $INSTALL_DIR/scripts/backup.sh

# Health check every 30 minutes
*/30 * * * * $BOT_USER $INSTALL_DIR/scripts/healthcheck.sh

# Clean old logs weekly
0 3 * * 0 $BOT_USER find $INSTALL_DIR/logs -name "*.log" -mtime +7 -delete
EOF

# Configure Fail2Ban
echo -e "${BLUE}🔒 Configuring Fail2Ban...${NC}"
cat > /etc/fail2ban/jail.d/musicbot.conf << EOF
[musicbot]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# Setup firewall
echo -e "${BLUE}🛡️ Configuring firewall...${NC}
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Reload systemd
systemctl daemon-reload
systemctl enable $SERVICE_NAME

# Start the service
echo -e "${BLUE}▶️ Starting bot service...${NC}"
systemctl start $SERVICE_NAME

# Wait and check
sleep 3
if systemctl is-active --quiet $SERVICE_NAME; then
    echo -e "${GREEN}✅ Bot service started successfully!${NC}"
else
    echo -e "${RED}❌ Failed to start service${NC}"
    systemctl status $SERVICE_NAME
    exit 1
fi

# Show final status
echo ""
echo -e "${GREEN}🎉 Installation Complete!${NC}"
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
systemctl status $SERVICE_NAME --no-pager -l | head -10
echo ""
echo -e "${BLUE}📋 Useful Commands:${NC}"
echo "  View logs:    journalctl -u $SERVICE_NAME -f"
echo "               tail -f $INSTALL_DIR/logs/bot.log"
echo "  Restart:      systemctl restart $SERVICE_NAME"
echo "  Stop:         systemctl stop $SERVICE_NAME"
echo "  Start:        systemctl start $SERVICE_NAME"
echo "  Status:       systemctl status $SERVICE_NAME"
echo ""
echo -e "${BLUE}📁 Important Locations:${NC}"
echo "  Bot files:    $INSTALL_DIR"
echo "  Playlists:    $INSTALL_DIR/playlists"
echo "  Logs:         $INSTALL_DIR/logs"
echo "  Config:       $INSTALL_DIR/.env"
echo ""
echo -e "${YELLOW}⚠️ Important Notes:${NC}"
echo "  1. Invite bot to Discord using: https://discord.com/api/oauth2/authorize?client_id=$DISCORD_CLIENT_ID&permissions=36700160&scope=bot%20applications.commands"
echo "  2. Bot will auto-restart on crashes"
echo "  3. Backups run daily at 2 AM"
echo "  4. Logs are rotated automatically"
echo ""
echo -e "${GREEN}🎵 Your Discord Music Bot is running!${NC}"