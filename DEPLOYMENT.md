# Discord Music Bot - Deployment Guide

## 📋 Table of Contents
- [Quick Start](#quick-start)
- [Ubuntu Server Setup](#ubuntu-server-setup)
- [Ban Risk Analysis](#ban-risk-analysis)
- [Service Management](#service-management)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

1. **Upload files to your Ubuntu server:**
```bash
# Create directory
sudo mkdir -p /opt/discord-music-bot
sudo chown $USER:$USER /opt/discord-music-bot

# Copy files (use SCP, SFTP, or git clone)
scp -r ./* user@your-server:/opt/discord-music-bot/
```

2. **Run the automated setup script:**
```bash
ssh user@your-server
cd /opt/discord-music-bot
sudo chmod +x ubuntu-setup.sh
sudo ./ubuntu-setup.sh
```

3. **Follow the prompts:**
   - Enter your Discord Bot Token
   - Enter your Discord Client ID
   - Script handles everything else

### Option 2: Test Run First

```bash
# 1. Create .env file
cp .env.example .env
nano .env

# 2. Make test script executable
chmod +x test-run.sh

# 3. Run bot to test
./test-run.sh
```

### Option 3: Optimized Version (Super Fast)

For maximum performance with instant playback:

```bash
# 1. Use the optimized version
node index-optimized.js

# 2. Or run performance tests first
node performance-test.js

# 3. Monitor performance
# Use /perf command in Discord
```

## 🐧 Ubuntu Server Setup

### System Requirements

- Ubuntu 20.04 or 22.04 (LTS recommended)
- 1 GB RAM minimum (2 GB recommended)
- 10 GB disk space
- Node.js 18+
- Stable internet connection

### Step 1: Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git wget ffmpeg python3-sox libsox-fmt-all fail2ban ufw

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node --version  # Should be v18+
npm --version   # Should be 8+
ffmpeg -version # Should show version
```

### Step 2: Create Bot User

```bash
# Create dedicated user for security
sudo useradd -r -s /bin/false -d /opt/discord-music-bot musicbot

# Create directories
sudo mkdir -p /opt/discord-music-bot/{playlists,logs,scripts}
sudo chown -R musicbot:musicbot /opt/discord-music-bot
sudo chmod 755 /opt/discord-music-bot
```

### Step 3: Install Bot Files

```bash
# Copy bot files to installation directory
sudo cp -r ./* /opt/discord-music-bot/
sudo chown -R musicbot:musicbot /opt/discord-music-bot

# Install dependencies
cd /opt/discord-music-bot
sudo -u musicbot npm ci --production
```

### Step 4: Configure Environment

```bash
# Create environment file
sudo nano /opt/discord-music-bot/.env
```

Add your configuration:
```env
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

# Anti-Ban Settings
REQUEST_DELAY=1000
MAX_RETRIES=3

# Optional Webhooks
BACKUP_WEBHOOK=
HEALTH_WEBHOOK=
```

Secure the file:
```bash
sudo chmod 600 /opt/discord-music-bot/.env
sudo chown musicbot:musicbot /opt/discord-music-bot/.env
```

### Step 5: Create Systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/musicbot.service
```

Paste the following configuration:
```ini
[Unit]
Description=Discord Music Bot
After=network.target

[Service]
Type=simple
User=musicbot
WorkingDirectory=/opt/discord-music-bot
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
EnvironmentFile=/opt/discord-music-bot/.env

# Security Settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/discord-music-bot/playlists
ReadWritePaths=/opt/discord-music-bot/logs
ProtectHome=true
RemoveIPC=true

# Resource Limits
LimitNOFILE=65536
MemoryMax=512M

# Logging
StandardOutput=file:/opt/discord-music-bot/logs/bot.log
StandardError=file:/opt/discord-music-bot/logs/error.log

[Install]
WantedBy=multi-user.target
```

### Step 6: Configure Log Rotation

```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/musicbot
```

Add:
```
/opt/discord-music-bot/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 musicbot musicbot
    postrotate
        systemctl reload-or-restart musicbot || true
    endscript
}
```

### Step 7: Start the Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable musicbot

# Start the bot
sudo systemctl start musicbot

# Check status
sudo systemctl status musicbot
```

## ⚠️ Ban Risk Analysis

### Understanding the Risks

#### YouTube Scraping
- **Risk Level**: Low to Medium
- **Reality**: YouTube rarely IP-bans for small-scale scraping
- **Protection**: Built-in rate limiting and random delays

#### Spotify Integration
- **Risk Level**: None
- **Why**: Only fetches metadata, actual audio from YouTube
- **Compliance**: Falls under fair use for metadata

#### Discord API
- **Risk Level**: None
- **Why**: Using official API with proper authentication
- **Compliance**: Fully compliant with Discord ToS

### Built-in Anti-Ban Measures

#### 1. Rate Limiting
```javascript
// Per-user rate limiting
const MAX_REQUESTS_PER_MINUTE = 10;
const MIN_REQUEST_DELAY = 1000; // 1 second
```

#### 2. Human-like Behavior
- Random delays between requests (100-500ms)
- User-Agent rotation
- Exponential backoff on errors
- Natural request patterns

#### 3. Smart Caching
- Stream caching (50 items max, 5-minute TTL)
- Reduces repeated requests
- Automatic cleanup

#### 4. Error Handling
- Maximum 3 retries with exponential backoff
- Graceful degradation on failures
- Error logging without crashing

### Why You Won't Get Banned

1. **Scale**: Personal use, not commercial scraping
2. **Limits**: Can't make more than 10 requests/minute per user
3. **Delays**: Random delays prevent detection patterns
4. **Respect**: Follows robots.txt and terms
5. **Fallback**: Multiple sources if one fails

## 🔧 Service Management

### Basic Commands

```bash
# Start/Stop/Restart
sudo systemctl start musicbot
sudo systemctl stop musicbot
sudo systemctl restart musicbot

# Enable/Disable auto-start
sudo systemctl enable musicbot
sudo systemctl disable musicbot

# Check status
sudo systemctl status musicbot

# View logs
sudo journalctl -u musicbot -f          # Live logs
sudo journalctl -u musicbot -n 100      # Last 100 lines
tail -f /opt/discord-music-bot/logs/bot.log  # Direct log file

# Reload after config changes
sudo systemctl daemon-reload
sudo systemctl restart musicbot
```

### Resource Monitoring

```bash
# Check memory usage
ps -o pid,ppid,cmd,%mem,%cpu --sort=-%mem -C node

# Monitor in real-time
htop

# Check disk usage
df -h /opt/discord-music-bot

# View service resource usage
systemctl status musicbot
```

### Configuration Management

```bash
# Edit configuration
sudo nano /opt/discord-music-bot/.env

# After editing, restart service
sudo systemctl restart musicbot

# Backup configuration
sudo cp /opt/discord-music-bot/.env /opt/discord-music-bot/.env.backup
```

## 🔧 Maintenance

### Automated Maintenance Tasks

#### 1. Backups
The setup includes automated daily backups:
- Back up playlists and configuration
- Stored in `/var/backups/musicbot/`
- Keeps 30 days of backups

#### 2. Log Rotation
- Daily log rotation
- Keeps 7 days of compressed logs
- Automatic cleanup

#### 3. Health Checks
- Runs every 30 minutes
- Checks service status and memory usage
- Restarts if needed

#### 4. Updates
Update script included:
```bash
# Run update (from /opt/discord-music-bot)
sudo ./scripts/update.sh
```

### Manual Maintenance

#### 1. Update Bot Code
```bash
cd /opt/discord-music-bot

# Pull latest changes
sudo -u musicbot git pull origin main

# Update dependencies
sudo -u musicbot npm ci --production

# Restart service
sudo systemctl restart musicbot
```

#### 2. Clear Cache
```bash
# Restart service to clear cache
sudo systemctl restart musicbot

# Or manually remove cache files
sudo rm -rf /tmp/discord-music-cache-*
```

#### 3. Manage Playlists
```bash
# Playlist location
ls -la /opt/discord-music-bot/playlists/

# Backup playlists manually
sudo tar -czf playlists-backup.tar.gz /opt/discord-music-bot/playlists/
```

### Performance Tuning

#### 1. Adjust Memory Limits
Edit `/etc/systemd/system/musicbot.service`:
```ini
# Increase memory limit if needed
MemoryMax=1G
```

#### 2. Adjust Rate Limits
Edit `/opt/discord-music-bot/.env`:
```env
# More conservative limits if needed
REQUEST_DELAY=2000
MAX_RETRIES=2
```

#### 3. Enable Verbose Logging
Edit `/opt/discord-music-bot/.env`:
```env
DEBUG=discord-music-bot:*
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Bot Won't Start
```bash
# Check service status
sudo systemctl status musicbot

# Check for errors
sudo journalctl -u musicbot -n 50

# Check syntax
sudo -u musicbot node -c /opt/discord-music-bot/index.js
```

#### 2. No Audio
```bash
# Check FFmpeg
ffmpeg -version

# Check voice connection
sudo journalctl -u musicbot | grep -i voice

# Check audio permissions
sudo getent group audio
sudo usermod -a -G audio musicbot
```

#### 3. High Memory Usage
```bash
# Check memory
ps -o pid,ppid,cmd,%mem,%cpu --sort=-%mem -C node

# Restart service
sudo systemctl restart musicbot

# Check for memory leaks
sudo journalctl -u musicbot | grep -i memory
```

#### 4. Commands Not Working
```bash
# Check bot permissions in Discord
# Ensure bot has:
# - Connect
# - Speak
# - Send Messages
# - Embed Links
# - Read Message History

# Re-register commands
cd /opt/discord-music-bot
sudo -u musicbot node deploy-commands.js
```

#### 5. Rate Limit Errors
```bash
# Check logs for rate limit issues
sudo journalctl -u musicbot | grep -i "rate limit"

# Increase delays in .env
REQUEST_DELAY=2000
```

### Log Analysis

#### 1. Filter Errors
```bash
# Show only errors
sudo journalctl -u musicbot | grep -i error

# Show warnings
sudo journalctl -u musicbot | grep -i warn

# Show recent activity
sudo journalctl -u musicbot --since "1 hour ago"
```

#### 2. Monitor Performance
```bash
# Real-time monitoring
sudo journalctl -u musicbot -f | grep -E "(memory|cpu|error)"

# Resource usage over time
sudo journalctl -u musicbot | grep -o "Memory usage: [0-9]*MB" | tail -20
```

### Recovery Procedures

#### 1. Full Reset
```bash
# Stop service
sudo systemctl stop musicbot

# Backup current data
sudo cp -r /opt/discord-music-bot /opt/discord-music-bot.backup.$(date +%Y%m%d)

# Clear playlists and logs
sudo rm -rf /opt/discord-music-bot/playlists/*
sudo rm -rf /opt/discord-music-bot/logs/*

# Restart
sudo systemctl start musicbot
```

#### 2. Restore from Backup
```bash
# Stop service
sudo systemctl stop musicbot

# Find latest backup
ls -la /var/backups/musicbot/

# Restore playlists
sudo tar -xzf /var/backups/musicbot/playlists_*.tar.gz -C /opt/discord-music-bot/

# Restore config
sudo cp /var/backups/musicbot/config_*.env /opt/discord-music-bot/.env

# Restart
sudo systemctl start musicbot
```

### Health Check

Create a simple health check script:
```bash
#!/bin/bash
# /opt/discord-music-bot/health-check.sh

SERVICE="musicbot"
LOG="/opt/discord-music-bot/logs/health.log"

echo "[$(date)] Health check started" >> $LOG

# Check if service is running
if systemctl is-active --quiet $SERVICE; then
    # Get process info
    PID=$(pgrep -f "node index.js")
    if [ -n "$PID" ]; then
        MEMORY_KB=$(ps -p $PID -o rss= | tail -1)
        MEMORY_MB=$((MEMORY_KB / 1024))
        echo "[$(date)] Service running, PID: $PID, Memory: ${MEMORY_MB}MB" >> $LOG
        
        # Alert if memory too high
        if [ $MEMORY_MB -gt 500 ]; then
            echo "[$(date)] WARNING: High memory usage" >> $LOG
        fi
    fi
else
    echo "[$(date)] ERROR: Service not running, restarting..." >> $LOG
    systemctl restart $SERVICE
fi

echo "[$(date)] Health check completed" >> $LOG
```

## 📊 Monitoring

### Setting Up Monitoring

#### 1. Basic Monitoring
```bash
# Add to crontab
sudo crontab -e
*/5 * * * * /opt/discord-music-bot/health-check.sh
```

#### 2. Advanced Monitoring with Metrics
```bash
# Install metrics collector
sudo apt install -y prometheus-node-exporter
sudo systemctl enable prometheus-node-exporter
sudo systemctl start prometheus-node-exporter
```

#### 3. Log Monitoring
```bash
# Install log monitoring
sudo apt install -y goaccess
# Analyze access logs if web interface added
```

### Metrics to Watch

1. **Memory Usage**: Should stay under 512MB
2. **CPU Usage**: Should be minimal when idle
3. **Request Rate**: Monitor for unusual spikes
4. **Error Rate**: Should be near 0%
5. **Uptime**: Should be 99%+

### Alerting Setup

Create a simple alert script:
```bash
#!/bin/bash
# /opt/discord-music-bot/alert.sh

MEMORY_KB=$(ps -o rss,comm -p $(pgrep -f "node index.js") | tail -1 | awk '{print $1}')
MEMORY_MB=$((MEMORY_KB / 1024))

if [ $MEMORY_MB -gt 600 ]; then
    # Send alert (email, webhook, etc.)
    curl -X POST -H "Content-Type: application/json" \
        -d "{\"content\": \"🚨 High memory usage: ${MEMORY_MB}MB\"}" \
        $WEBHOOK_URL
fi
```

## 🔄 Backup and Recovery

### Backup Strategy

1. **Daily Backups**:
   - Playlists
   - Configuration files
   - Logs (7-day retention)

2. **Weekly Backups**:
   - Entire bot directory
   - Systemd service files
   - 30-day retention

3. **Off-site Backups**:
   - Consider rsync to remote server
   - Or cloud storage (S3, etc.)

### Backup Script Example

```bash
#!/bin/bash
# /opt/discord-music-bot/backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/musicbot"
RETENTION_DAYS=30

mkdir -p $BACKUP_DIR

# Backup playlists
tar -czf "$BACKUP_DIR/playlists_$DATE.tar.gz" \
    -C /opt/discord-music-bot playlists 2>/dev/null

# Backup config
cp /opt/discord-music-bot/.env "$BACKUP_DIR/config_$DATE.env"

# Backup service files
cp /etc/systemd/system/musicbot.service "$BACKUP_DIR/service_$DATE.service"

# Clean old backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.env" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
```

### Recovery Procedures

1. **Restore Playlists**:
```bash
sudo systemctl stop musicbot
sudo tar -xzf /var/backups/musicbot/playlists_YYYYMMDD.tar.gz -C /opt/discord-music-bot/
sudo systemctl start musicbot
```

2. **Restore Configuration**:
```bash
sudo cp /var/backups/musicbot/config_YYYYMMDD.env /opt/discord-music-bot/.env
sudo systemctl restart musicbot
```

3. **Complete Restore**:
```bash
# Stop service
sudo systemctl stop musicbot

# Restore from backup
sudo rsync -av /backups/musicbot/full_YYYYMMDD/ /opt/discord-music-bot/

# Restore service file
sudo cp /backups/musicbot/service_YYYYMMDD.service /etc/systemd/system/musicbot.service

# Start service
sudo systemctl daemon-reload
sudo systemctl start musicbot
```

## 🔒 Security Hardening

### System Security

1. **Firewall Configuration**:
```bash
# Enable UFW
sudo ufw enable

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow necessary ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (optional)
sudo ufw allow 443/tcp  # HTTPS (optional)
```

2. **Fail2Ban**:
```bash
# Already installed, check status
sudo systemctl status fail2ban

# View banned IPs
sudo fail2ban-client status sshd
```

3. **SSH Security**:
```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Recommended settings:
Port 2222  # Change from default
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes

# Restart SSH
sudo systemctl restart sshd
```

### Application Security

1. **Run as Non-root User**:
   - Bot runs as `musicbot` user
   - Limited permissions
   - Can't access system files

2. **Environment Variables**:
   - Sensitive data in `.env` file
   - File permissions: 600
   - Not committed to git

3. **Resource Limits**:
```ini
# In systemd service
MemoryMax=512M
LimitNOFILE=65536
PrivateTmp=true
ProtectSystem=strict
```

### Network Security

1. **SSL/TLS**:
   - Use HTTPS for web interface
   - Consider reverse proxy with Nginx

2. **VPN/Tunnel**:
   - Consider running bot behind VPN
   - Or use SSH tunneling

## 📈 Performance Optimization

### Node.js Optimization

1. **Increase Memory Limit**:
```bash
# In systemd service
ExecStart=/usr/bin/node --max-old-space-size=1024 index.js
```

2. **Cluster Mode** (Advanced):
```javascript
// For high-traffic servers
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
} else {
    // Bot code here
}
```

### System Optimization

1. **Swap Configuration**:
```bash
# Create swap file if low RAM
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Add to fstab
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

2. **Kernel Tuning**:
```bash
# Add to /etc/sysctl.conf
fs.file-max = 100000
net.core.somaxconn = 65536
net.ipv4.tcp_max_syn_backlog = 65536
```

### Bot Optimization

1. **Cache Tuning**:
```javascript
// In bot code
const CACHE_SIZE = 100;  // Increase from 50
const CACHE_TTL = 600000; // Increase to 10 minutes
```

2. **Connection Pooling**:
```javascript
// Keep voice connections alive
const STAY_TIMEOUT = 300000; // 5 minutes
```

## 🌐 Web Interface (Optional)

### Nginx Reverse Proxy

1. **Install Nginx**:
```bash
sudo apt install nginx
```

2. **Configure**:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **Enable SSL**:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Dashboard (Future Enhancement)

Consider adding:
- Web dashboard for queue management
- Statistics visualization
- Remote control interface
- User management

## 📝 Final Checklist

### Pre-Deployment

- [ ] Ubuntu 20.04/22.04 LTS
- [ ] Node.js 18+ installed
- [ ] FFmpeg installed
- [ ] Bot token and client ID ready
- [ ] Domain name (optional)
- [ ] SSL certificate (optional)

### Deployment Steps

- [ ] Create bot user
- [ ] Install bot files
- [ ] Configure .env
- [ ] Create systemd service
- [ ] Start service
- [ ] Verify functionality
- [ ] Set up monitoring
- [ ] Configure backups

### Post-Deployment

- [ ] Test all commands
- [ ] Check memory usage
- [ ] Verify log rotation
- [ ] Test backup/restore
- [ ] Monitor for 24 hours
- [ ] Set up alerts

### Security

- [ ] Firewall configured
- [ ] Fail2Ban running
- [ ] SSH secured
- [ ] Non-root user
- [ ] Permissions set

### Performance

- [ ] Memory usage normal
- [ ] CPU usage low
- [ ] Responsive commands
- [ ] No memory leaks
- [ ] Fast startup

---

## 🆘 Support

If you encounter issues:

1. **Check logs**: `sudo journalctl -u musicbot -f`
2. **Review this guide**: Common issues in troubleshooting section
3. **Check GitHub**: Create issue for bugs
4. **Community**: Join Discord server for support

Remember: This bot is provided as-is. Use responsibly and respect Discord's Terms of Service!