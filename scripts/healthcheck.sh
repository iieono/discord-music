#!/bin/bash

# Discord Music Bot Health Check Script
# Monitors bot health and reports issues

BOT_DIR="/home/musicbot/discord-music-bot"
SERVICE_NAME="musicbot"
LOG_FILE="$BOT_DIR/logs/healthcheck.log"
WEBHOOK_URL=""  # Optional Discord webhook for alerts

# Create log directory
mkdir -p "$BOT_DIR/logs"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Send alert function
send_alert() {
    local message="$1"
    log "ALERT: $message"
    
    if [ -n "$WEBHOOK_URL" ]; then
        curl -X POST -H "Content-Type: application/json" \
            -d "{\"content\": \"🚨 Music Bot Alert: $message\"}" \
            "$WEBHOOK_URL" >/dev/null 2>&1
    fi
}

# Check service status
log "Starting health check"

if systemctl is-active --quiet $SERVICE_NAME; then
    log "✅ Service is running"
    
    # Check service uptime
    local uptime=$(systemctl show $SERVICE_NAME --property=ActiveState --value)
    log "Service uptime: $uptime"
    
    # Check memory usage
    local memory_usage=$(ps -o rss,comm -p $(pgrep -f "node index.js") | tail -1 | awk '{print $1}')
    if [ -n "$memory_usage" ]; then
        local memory_mb=$((memory_usage / 1024))
        log "Memory usage: ${memory_mb}MB"
        
        if [ $memory_mb -gt 500 ]; then
            send_alert "High memory usage: ${memory_mb}MB"
        fi
    fi
    
    # Check disk space
    local disk_usage=$(df -h "$BOT_DIR" | tail -1 | awk '{print $5}' | sed 's/%//')
    log "Disk usage: ${disk_usage}%"
    
    if [ $disk_usage -gt 80 ]; then
        send_alert "High disk usage: ${disk_usage}%"
    fi
    
    # Check if bot is responding
    if pgrep -f "node index.js" >/dev/null; then
        log "✅ Bot process is running"
    else
        send_alert "Bot process not found!"
        exit 1
    fi
    
    # Check log file size
    if [ -f "$BOT_DIR/logs/bot.log" ]; then
        local log_size=$(du -h "$BOT_DIR/logs/bot.log" | cut -f1)
        log "Log file size: $log_size"
    fi
    
    # Check network connectivity
    if ping -c 1 discord.com >/dev/null 2>&1; then
        log "✅ Network connectivity OK"
    else
        send_alert "Network connectivity issues detected"
    fi
    
    # Check FFmpeg
    if command -v ffmpeg >/dev/null 2>&1; then
        log "✅ FFmpeg is available"
    else
        send_alert "FFmpeg not found!"
    fi
    
    # Check Node.js process
    local node_procs=$(pgrep -f "node index.js" | wc -l)
    if [ "$node_procs" -eq 1 ]; then
        log "✅ Correct number of Node.js processes running"
    else
        send_alert "Unexpected number of Node.js processes: $node_procs"
    fi
    
else
    send_alert "Service $SERVICE_NAME is not running!"
    
    # Attempt to restart
    log "Attempting to restart service..."
    systemctl restart $SERVICE_NAME
    sleep 10
    
    if systemctl is-active --quiet $SERVICE_NAME; then
        log "✅ Service restarted successfully"
    else
        send_alert "Failed to restart service!"
        exit 1
    fi
fi

# Check for recent errors in logs
if [ -f "$BOT_DIR/logs/bot.log" ]; then
    local recent_errors=$(tail -n 100 "$BOT_DIR/logs/bot.log" | grep -i "error\|failed\|exception" | wc -l)
    if [ "$recent_errors" -gt 5 ]; then
        send_alert "High number of errors detected: $recent_errors in last 100 lines"
    fi
fi

# Check bot age
if [ -f "$BOT_DIR/package.json" ]; then
    local bot_age=$(find "$BOT_DIR" -name "package.json" -mtime +30 | wc -l)
    if [ "$bot_age" -gt 0 ]; then
        log "⚠️  Bot files haven't been updated in over 30 days"
    fi
fi

log "Health check completed"

# Generate health report
cat > "$BOT_DIR/health_report.txt" << EOF
Discord Music Bot Health Report
Generated: $(date)

Service Status: $(systemctl is-active $SERVICE_NAME)
Memory Usage: ${memory_mb:-N/A}MB
Disk Usage: ${disk_usage:-N/A}%
Recent Errors: ${recent_errors:-0}
Uptime: $uptime

Last Check: $(date)
EOF

exit 0