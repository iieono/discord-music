#!/bin/bash

# Discord Music Bot Quick Start Script for Ubuntu

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BOT_USER="musicbot"
SERVICE_NAME="musicbot"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                Discord Music Bot Quick Start                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Please run as root or with sudo${NC}"
    exit 1
fi

# Function to ask yes/no questions
ask_yes_no() {
    while true; do
        read -p "$1 (y/n): " yn
        case $yn in
            [Yy]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Please answer yes or no.";;
        esac
    done
}

# Check if bot is already installed
if systemctl is-active --quiet $SERVICE_NAME 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Music bot service is already running${NC}"
    
    if ask_yes_no "Do you want to stop the bot and continue?"; then
        systemctl stop $SERVICE_NAME
    else
        echo -e "${GREEN}✅ Keeping current installation${NC}"
        exit 0
    fi
fi

echo -e "${GREEN}🚀 Starting Discord Music Bot installation...${NC}"
echo ""

# Install dependencies
echo -e "${BLUE}📦 Installing system dependencies...${NC}"
apt update >/dev/null 2>&1
apt install -y curl git ffmpeg python3-sox libsox-fmt-all >/dev/null 2>&1

# Install Node.js
if ! command -v node &> /dev/null; then
    echo -e "${BLUE}📥 Installing Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - >/dev/null 2>&1
    apt install -y nodejs >/dev/null 2>&1
fi

# Create bot user
if ! id "$BOT_USER" &>/dev/null; then
    echo -e "${BLUE}👤 Creating bot user...${NC}"
    useradd -m -s /bin/bash $BOT_USER
fi

# Bot directory
BOT_DIR="/home/$BOT_USER/discord-music-bot"

# Create directory structure
echo -e "${BLUE}📁 Creating directories...${NC}"
mkdir -p $BOT_DIR/{playlists,logs,scripts}
chown -R $BOT_USER:$BOT_USER $BOT_DIR

# Copy files if they exist in current directory
if [ -f "index.js" ] && [ -f "package.json" ]; then
    echo -e "${BLUE}📂 Copying bot files...${NC}"
    cp -r . $BOT_DIR/
    chown -R $BOT_USER:$BOT_USER $BOT_DIR
fi

# Switch to bot user for npm operations
echo -e "${BLUE}📦 Installing Node.js dependencies...${NC}"
sudo -u $BOT_USER bash -c "cd $BOT_DIR && npm ci --production"

# Create environment file
if [ ! -f "$BOT_DIR/.env" ]; then
    echo -e "${YELLOW}⚙️  Configuration needed${NC}"
    echo ""
    
    read -p "Enter your Discord Bot Token: " DISCORD_TOKEN
    read -p "Enter your Discord Client ID: " DISCORD_CLIENT_ID
    
    cat > $BOT_DIR/.env << EOF
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
    
    chmod 600 $BOT_DIR/.env
    chown $BOT_USER:$BOT_USER $BOT_DIR/.env
    
    echo -e "${GREEN}✅ Configuration saved${NC}"
else
    echo -e "${YELLOW}⚠️  .env file already exists${NC}"
fi

# Create systemd service
echo -e "${BLUE}⚙️  Creating systemd service...${NC}"
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

# Set up log rotation
echo -e "${BLUE}📊 Setting up log rotation...${NC}"
cat > /etc/logrotate.d/musicbot << EOF
$BOT_DIR/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 $BOT_USER $BOT_USER
}
EOF

# Create maintenance scripts
echo -e "${BLUE}🔧 Creating maintenance scripts...${NC}"

# Backup script
cat > $BOT_DIR/scripts/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/musicbot/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BOT_DIR="/home/musicbot/discord-music-bot"

mkdir -p $BACKUP_DIR

# Backup playlists
if [ -d "$BOT_DIR/playlists" ]; then
    tar -czf "$BACKUP_DIR/playlists_$DATE.tar.gz" -C "$BOT_DIR" playlists 2>/dev/null
fi

# Backup config
if [ -f "$BOT_DIR/.env" ]; then
    cp "$BOT_DIR/.env" "$BACKUP_DIR/config_$DATE.env"
    chmod 600 "$BACKUP_DIR/config_$DATE.env"
fi

# Clean old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete 2>/dev/null
find "$BACKUP_DIR" -name "config_*.env" -mtime +30 -delete 2>/dev/null

echo "Backup completed: $DATE"
EOF

# Health check script
cat > $BOT_DIR/scripts/healthcheck.sh << 'EOF'
#!/bin/bash
SERVICE_NAME="musicbot"
LOG_FILE="/home/musicbot/discord-music-bot/logs/healthcheck.log"

echo "[$(date)] Starting health check" >> $LOG_FILE

if systemctl is-active --quiet $SERVICE_NAME; then
    echo "[$(date)] ✅ Service is running" >> $LOG_FILE
    
    # Check memory usage
    memory_usage=$(ps -o rss,comm -p $(pgrep -f "node index.js") | tail -1 | awk '{print $1}')
    if [ -n "$memory_usage" ]; then
        memory_mb=$((memory_usage / 1024))
        echo "[$(date)] Memory usage: ${memory_mb}MB" >> $LOG_FILE
        
        if [ $memory_mb -gt 500 ]; then
            echo "[$(date)] ⚠️ High memory usage detected" >> $LOG_FILE
        fi
    fi
else
    echo "[$(date)] ❌ Service not running, attempting restart" >> $LOG_FILE
    systemctl restart $SERVICE_NAME
    sleep 5
    
    if systemctl is-active --quiet $SERVICE_NAME; then
        echo "[$(date)] ✅ Service restarted successfully" >> $LOG_FILE
    else
        echo "[$(date)] ❌ Failed to restart service" >> $LOG_FILE
        exit 1
    fi
fi

echo "[$(date)] Health check completed" >> $LOG_FILE
EOF

# Make scripts executable
chmod +x $BOT_DIR/scripts/*.sh
chown $BOT_USER:$BOT_USER $BOT_DIR/scripts/*.sh

# Set up cron jobs
echo -e "${BLUE}⏰ Setting up cron jobs...${NC}"
sudo -u $BOT_USER crontab - << EOF
# Daily backup at 2 AM
0 2 * * * $BOT_DIR/scripts/backup.sh

# Health check every 30 minutes
*/30 * * * * $BOT_DIR/scripts/healthcheck.sh

# Clean old logs weekly
0 3 * * 0 find $BOT_DIR/logs -name "*.log" -mtime +7 -delete
EOF

# Fix permissions
echo -e "${BLUE}🔐 Setting permissions...${NC}"
chown -R $BOT_USER:$BOT_USER $BOT_DIR
chmod 755 $BOT_DIR
chmod 600 $BOT_DIR/.env
chmod 700 $BOT_DIR/scripts

# Reload systemd
systemctl daemon-reload
systemctl enable $SERVICE_NAME

# Start the service
echo -e "${BLUE}▶️  Starting bot service...${NC}"
systemctl start $SERVICE_NAME

# Wait and check status
sleep 5
if systemctl is-active --quiet $SERVICE_NAME; then
    echo -e "${GREEN}✅ Bot service started successfully!${NC}"
else
    echo -e "${RED}❌ Failed to start bot service${NC}"
    echo -e "${YELLOW}Check logs: journalctl -u $SERVICE_NAME -n 50${NC}"
    exit 1
fi

# Show status
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
systemctl status $SERVICE_NAME --no-pager -l

echo ""
echo -e "${GREEN}🎉 Installation complete!${NC}"
echo ""
echo -e "${BLUE}📋 Useful Commands:${NC}"
echo "  View logs:     journalctl -u $SERVICE_NAME -f"
echo "  Restart bot:   systemctl restart $SERVICE_NAME"
echo "  Stop bot:      systemctl stop $SERVICE_NAME"
echo "  Start bot:     systemctl start $SERVICE_NAME"
echo "  Check status:  systemctl status $SERVICE_NAME"
echo ""
echo -e "${BLUE}📁 Important Locations:${NC}"
echo "  Bot files:     $BOT_DIR"
echo "  Playlists:     $BOT_DIR/playlists"
echo "  Logs:          $BOT_DIR/logs"
echo "  Config:        $BOT_DIR/.env"
echo ""
echo -e "${YELLOW}⚠️  Remember to:${NC}"
echo "  1. Invite your bot to your Discord server"
echo "  2. Use /play command to start playing music"
echo "  3. Check logs if you encounter any issues"
echo ""
echo -e "${GREEN}🎵 Your Discord Music Bot is now running!${NC}"