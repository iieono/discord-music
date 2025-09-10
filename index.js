const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');
const playdl = require('play-dl');
const { getPreview } = require('spotify-url-info');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

client.commands = new Collection();
client.queues = new Map();
client.playlists = new Map();
client.stats = new Map();
client.cache = new Map();
client.cooldowns = new Collection();
client.djRoles = new Map();
client.announcements = new Map();

const commands = [
    {
        name: 'play',
        description: 'Play a song from YouTube, Spotify, or SoundCloud',
        options: [
            {
                name: 'query',
                type: 3,
                description: 'Song name or URL',
                required: true
            },
            {
                name: 'filter',
                type: 3,
                description: 'Search filter (duration, date, views)',
                required: false,
                choices: [
                    { name: 'Short (< 4 min)', value: 'short' },
                    { name: 'Medium (4-10 min)', value: 'medium' },
                    { name: 'Long (> 10 min)', value: 'long' },
                    { name: 'This week', value: 'week' },
                    { name: 'This month', value: 'month' },
                    { name: 'This year', value: 'year' },
                    { name: 'Most viewed', value: 'views' }
                ]
            }
        ]
    },
    {
        name: 'skip',
        description: 'Skip the current song'
    },
    {
        name: 'voteskip',
        description: 'Vote to skip the current song'
    },
    {
        name: 'queue',
        description: 'Show the current queue'
    },
    {
        name: 'nowplaying',
        description: 'Show the currently playing song'
    },
    {
        name: 'volume',
        description: 'Set the volume (0-200)',
        options: [
            {
                name: 'amount',
                type: 4,
                description: 'Volume amount',
                required: true
            }
        ]
    },
    {
        name: 'pause',
        description: 'Pause the current song'
    },
    {
        name: 'resume',
        description: 'Resume the current song'
    },
    {
        name: 'stop',
        description: 'Stop playing and leave the channel'
    },
    {
        name: 'loop',
        description: 'Toggle loop mode',
        options: [
            {
                name: 'mode',
                type: 3,
                description: 'Loop mode (off, song, queue)',
                required: true,
                choices: [
                    { name: 'Off', value: 'off' },
                    { name: 'Song', value: 'song' },
                    { name: 'Queue', value: 'queue' }
                ]
            }
        ]
    },
    {
        name: 'shuffle',
        description: 'Shuffle the queue'
    },
    {
        name: 'remove',
        description: 'Remove a song from the queue',
        options: [
            {
                name: 'index',
                type: 4,
                description: 'Queue index to remove',
                required: true
            }
        ]
    },
    {
        name: 'eq',
        description: 'Apply an equalizer preset',
        options: [
            {
                name: 'preset',
                type: 3,
                description: 'Equalizer preset',
                required: true,
                choices: [
                    { name: 'Flat', value: 'flat' },
                    { name: 'Bass Boost', value: 'bass' },
                    { name: 'Treble Boost', value: 'treble' },
                    { name: 'Vocal', value: 'vocal' },
                    { name: 'Piano', value: 'piano' }
                ]
            }
        ]
    },
    {
        name: 'playlist-save',
        description: 'Save the current queue as a playlist',
        options: [
            {
                name: 'name',
                type: 3,
                description: 'Playlist name',
                required: true
            }
        ]
    },
    {
        name: 'playlist-load',
        description: 'Load a saved playlist',
        options: [
            {
                name: 'name',
                type: 3,
                description: 'Playlist name',
                required: true
            }
        ]
    },
    {
        name: 'playlist-list',
        description: 'List all saved playlists'
    },
    {
        name: 'stats',
        description: 'Show music statistics'
    },
    {
        name: 'announce',
        description: 'Toggle music announcements in a channel',
        options: [
            {
                name: 'channel',
                type: 7,
                description: 'Channel to announce in (leave blank to disable)',
                required: false
            }
        ]
    },
    {
        name: 'djrole',
        description: 'Set the DJ role for advanced controls',
        options: [
            {
                name: 'role',
                type: 8,
                description: 'DJ role (leave blank to remove)',
                required: false
            }
        ]
    },
    {
        name: 'performance',
        description: 'Show instant playback performance stats'
    }
];

class MusicQueue {
    constructor(guildId, voiceChannel, textChannel) {
        this.guildId = guildId;
        this.voiceChannel = voiceChannel;
        this.textChannel = textChannel;
        this.connection = null;
        this.player = createAudioPlayer();
        this.songs = [];
        this.volume = config.defaultVolume;
        this.loop = 'off';
        this.playing = false;
        this.paused = false;
        this.nowPlayingMessage = null;
        this.leaveTimeout = null;
        this.progressInterval = null;
        this.startTime = null;
        this.currentDuration = 0;
        this.voteSkips = new Set();
        this.equalizer = 'flat';
        this.filters = [];
        this.streamCache = new Map();
        
        // Instant Playback Optimizations
        this.preBufferCache = new Map(); // Cache for pre-buffered audio
        this.audioResources = new Map(); // Pre-created audio resources
        this.preBufferTimeout = null;
        this.preBuffering = false;
        this.maxCacheSize = 30; // Max pre-buffered songs
        this.preBufferSize = 1024 * 512; // 512KB pre-buffer
        this.nextSongPreBuffered = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
    }

    // Instant Playback: Pre-buffer audio for instant playback
    async preBufferSong(song) {
        // Debug: Log song object
        console.log('DEBUG: preBufferSong called with song:', {
            title: song?.title,
            url: song?.url,
            source: song?.source,
            hasUrl: !!song?.url,
            urlType: typeof song?.url
        });
        
        // Validate song URL first
        if (!song || !song.url || !song.url.startsWith('http')) {
            console.error('Invalid song URL for pre-buffering:', song?.url);
            return;
        }
        
        const cacheKey = `${song.url}-${this.equalizer}`;
        
        // Skip if already cached
        if (this.preBufferCache.has(cacheKey) || this.audioResources.has(cacheKey)) {
            return;
        }

        try {
            // Start pre-buffering in background
            this.preBuffering = true;
            
            let stream;
            if (song.source === 'spotify') {
                const searchQuery = `${song.title} ${song.artist}`;
                const searchResults = await playdl.search(searchQuery, { limit: 1, source: 'youtube' });
                if (searchResults.length === 0) return;
                stream = await playdl.stream(searchResults[0].url, { quality: 2 });
            } else if (song.source === 'soundcloud') {
                stream = await playdl.stream(song.url, { quality: 2 });
            } else {
                // YouTube source - validate URL first
                try {
                    let streamUrl = song.url;
                    
                    console.log('DEBUG: Pre-buffer attempting to get video_info for URL:', song.url);
                    const videoInfo = await playdl.video_info(song.url);
                    
                    if (videoInfo && videoInfo.video_details) {
                        streamUrl = videoInfo.video_details.url;
                        console.log('DEBUG: Pre-buffer video_info successful, stream URL:', streamUrl);
                    } else {
                        throw new Error('Unable to get video info');
                    }
                    
                    // Try to stream with the direct URL
                    try {
                        stream = await playdl.stream(streamUrl, { quality: 2 });
                        console.log('DEBUG: Pre-buffer stream successful with direct URL');
                    } catch (streamError) {
                        console.log('DEBUG: Pre-buffer direct stream failed, trying fallback:', streamError.message);
                        // Fallback: try original URL
                        stream = await playdl.stream(song.url, { quality: 2 });
                        console.log('DEBUG: Pre-buffer fallback stream successful');
                    }
                } catch (error) {
                    console.error('YouTube pre-buffer error:', error);
                    console.log('DEBUG: Pre-buffer failed for URL:', song.url);
                    return; // Don't throw, just skip pre-buffering
                }
            }

            // Pre-create audio resource for instant playback
            const resource = createAudioResource(stream.stream, { 
                inlineVolume: true,
                metadata: {
                    title: song.title,
                    url: song.url
                }
            });
            
            // Apply volume and equalizer
            resource.volume.setVolume(this.volume / 100);
            this.applyEqualizer(resource);

            // Cache the pre-created resource
            this.audioResources.set(cacheKey, {
                resource: resource,
                stream: stream,
                timestamp: Date.now(),
                song: song
            });

            // Manage cache size
            if (this.audioResources.size > this.maxCacheSize) {
                const oldestKey = this.audioResources.keys().next().value;
                const oldest = this.audioResources.get(oldestKey);
                if (oldest.resource && oldest.resource.readable) {
                    oldest.resource.readable.destroy();
                }
                this.audioResources.delete(oldestKey);
            }

            this.preBuffering = false;
            
        } catch (error) {
            console.error('Pre-buffering failed:', error);
            this.preBuffering = false;
        }
    }

    // Instant Playback: Start pre-buffering next song
    async preBufferNextSong() {
        if (this.songs.length < 2 || this.nextSongPreBuffered) return;
        
        const nextSong = this.songs[1]; // Get next song in queue
        if (nextSong) {
            this.nextSongPreBuffered = true;
            // Don't await - run in background
            this.preBufferSong(nextSong).catch(console.error);
        }
    }

    // Instant Playback: Enhanced playSong with pre-buffering
    async playSong(song) {
        // Debug: Log song object
        console.log('DEBUG: playSong called with song:', {
            title: song?.title,
            url: song?.url,
            source: song?.source,
            hasUrl: !!song?.url,
            urlType: typeof song?.url
        });
        
        // Validate song object and URL
        if (!song || !song.url || !song.url.startsWith('http')) {
            console.error('Invalid song object or URL:', song);
            throw new Error('Invalid song URL');
        }
        
        const cacheKey = `${song.url}-${this.equalizer}`;
        
        // Check if we have a pre-buffered resource
        const cached = this.audioResources.get(cacheKey);
        let resource;
        
        if (cached && cached.resource) {
            // Use pre-buffered resource for instant playback
            resource = cached.resource;
            console.log(`✅ Instant playback: ${song.title}`);
            
            // Track cache hit
            this.updateStat('cacheHits', 1);
            
            // Remove from cache since we're using it
            this.audioResources.delete(cacheKey);
            this.nextSongPreBuffered = false;
        } else {
            // Fallback to normal streaming
            console.log(`⏳ Normal playback: ${song.title}`);
            let stream;
            
            if (song.source === 'spotify') {
                const searchQuery = `${song.title} ${song.artist}`;
                const searchResults = await playdl.search(searchQuery, { limit: 1, source: 'youtube' });
                if (searchResults.length === 0) {
                    throw new Error('No YouTube results found for Spotify track');
                }
                stream = await playdl.stream(searchResults[0].url, { quality: 2 });
            } else if (song.source === 'soundcloud') {
                if (!song.url || !song.url.startsWith('http')) {
                    throw new Error('Invalid SoundCloud URL');
                }
                stream = await playdl.stream(song.url, { quality: 2 });
            } else {
                // YouTube source
                if (!song.url || !song.url.startsWith('http')) {
                    throw new Error('Invalid YouTube URL');
                }
                
                try {
                    // Try multiple approaches to get a working stream
                    let streamUrl = song.url;
                    
                    console.log('DEBUG: PlaySong attempting to get video_info for URL:', song.url);
                    const videoInfo = await playdl.video_info(song.url);
                    
                    if (videoInfo && videoInfo.video_details) {
                        streamUrl = videoInfo.video_details.url;
                        console.log('DEBUG: PlaySong video_info successful, stream URL:', streamUrl);
                    } else {
                        throw new Error('Unable to get video info');
                    }
                    
                    // Try multiple streaming approaches
                    let streamSuccess = false;
                    
                    // Extract video ID for alternative approaches
                    const videoId = song.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/)?.[1];
                    console.log('DEBUG: Extracted video ID:', videoId);
                    
                    // Approach 1: Use stream with different options on stream_url
                    const streamOptions = [
                        { quality: 2, discordPlayerCompatibility: true },
                        { quality: 0, discordPlayerCompatibility: true },
                        { quality: 2 },
                        { quality: 0 }
                    ];
                    
                    for (const options of streamOptions) {
                        try {
                            console.log('DEBUG: PlaySong trying stream with options:', options);
                            stream = await playdl.stream(streamUrl, options);
                            console.log('DEBUG: PlaySong stream successful with options:', options);
                            streamSuccess = true;
                            break;
                        } catch (error) {
                            console.log('DEBUG: PlaySong stream failed with options:', options, 'Error:', error.message);
                        }
                    }
                    
                    // Approach 2: Try using play-dl's stream with video ID
                    if (!streamSuccess && videoId) {
                        try {
                            console.log('DEBUG: PlaySong trying stream with video ID');
                            const searchResults = await playdl.search(`https://youtu.be/${videoId}`, { limit: 1 });
                            if (searchResults.length > 0) {
                                stream = await playdl.stream(searchResults[0].url, { quality: 2 });
                                console.log('DEBUG: PlaySong video ID search successful');
                                streamSuccess = true;
                            }
                        } catch (error) {
                            console.log('DEBUG: PlaySong video ID search failed:', error.message);
                        }
                    }
                    
                    // Approach 3: Try using ytdl-core as fallback
                    if (!streamSuccess) {
                        try {
                            console.log('DEBUG: PlaySong trying ytdl-core fallback');
                            const ytdl = require('ytdl-core');
                            stream = { stream: ytdl(song.url, { quality: 'highestaudio', filter: 'audioonly' }) };
                            console.log('DEBUG: PlaySong ytdl-core fallback successful');
                            streamSuccess = true;
                        } catch (error) {
                            console.log('DEBUG: PlaySong ytdl-core fallback failed:', error.message);
                        }
                    }
                    
                    if (!streamSuccess) {
                        throw new Error('All streaming methods failed');
                    }
                } catch (error) {
                    console.error('YouTube stream error:', error);
                    console.log('DEBUG: PlaySong failed for URL:', song.url);
                    throw new Error(`Failed to stream YouTube video: ${error.message}`);
                }
            }

            resource = createAudioResource(stream.stream, { 
                inlineVolume: true 
            });
            
            this.applyEqualizer(resource);
        }
        
        resource.volume.setVolume(this.volume / 100);
        this.player.play(resource);
        this.playing = true;
        this.paused = false;
        this.startTime = Date.now();
        this.currentDuration = song.durationMs;
        song.plays++;
        
        // Track total plays for cache hit rate
        this.updateStat('totalPlays', 1);
        
        // Start predictive loading after a short delay
        setTimeout(() => {
            this.preBufferNextSong();
            this.predictiveLoad();
        }, 1000);
        
        // Clean up old cache entries periodically
        if (Math.random() < 0.1) { // 10% chance each play
            this.cleanupCache();
        }
        
        await this.updateNowPlaying(song);
        this.startProgressBar();
        
        const announcementChannel = client.announcements.get(this.guildId);
        if (announcementChannel && announcementChannel.id !== this.textChannel.id) {
            const embed = new EmbedBuilder()
                .setColor('#1DB954')
                .setTitle('🎵 Now Playing')
                .setDescription(`**${song.title}** in <#${this.voiceChannel.id}>`)
                .addFields(
                    { name: 'Duration', value: song.duration, inline: true },
                    { name: 'Requested by', value: song.requestedBy.toString(), inline: true }
                )
                .setThumbnail(song.thumbnail);
            
            announcementChannel.send({ embeds: [embed] });
        }
    }

    // Advanced Stream Caching: Intelligent cache management
    cleanupCache() {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes max age
        
        for (const [key, cached] of this.audioResources) {
            if (now - cached.timestamp > maxAge) {
                if (cached.resource && cached.resource.readable) {
                    cached.resource.readable.destroy();
                }
                this.audioResources.delete(key);
            }
        }
        
        // Clean old stream cache entries too
        for (const [key, stream] of this.streamCache) {
            if (now - (stream._timestamp || 0) > maxAge) {
                this.streamCache.delete(key);
            }
        }
    }

    // Predictive Loading: Anticipate user behavior
    async predictiveLoad() {
        if (this.songs.length < 3 || this.preBuffering) return;
        
        // Pre-buffer up to 3 upcoming songs
        const songsToPreBuffer = Math.min(3, this.songs.length - 1);
        
        for (let i = 1; i <= songsToPreBuffer; i++) {
            const song = this.songs[i];
            if (song) {
                const cacheKey = `${song.url}-${this.equalizer}`;
                if (!this.audioResources.has(cacheKey)) {
                    this.preBufferSong(song).catch(console.error);
                }
            }
        }
    }

    // Smart Cache Stats for monitoring
    getCacheStats() {
        return {
            preBufferedSongs: this.audioResources.size,
            streamCacheSize: this.streamCache.size,
            maxCacheSize: this.maxCacheSize,
            nextSongPreBuffered: this.nextSongPreBuffered,
            preBuffering: this.preBuffering,
            cacheHitRate: this.calculateCacheHitRate()
        };
    }

    calculateCacheHitRate() {
        // Simple cache hit rate calculation
        const total = this.stats.get('totalPlays') || 0;
        const hits = this.stats.get('cacheHits') || 0;
        return total > 0 ? Math.round((hits / total) * 100) : 0;
    }

    async connect() {
        try {
            this.connection = joinVoiceChannel({
                channelId: this.voiceChannel.id,
                guildId: this.guildId,
                adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
            });
            
            this.connection.subscribe(this.player);
            
            this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await this.reconnect();
                } catch (e) {
                    console.error('Failed to reconnect:', e);
                    this.destroy();
                }
            });
            
            this.connection.on('error', (error) => {
                console.error('Voice connection error:', error);
                this.reconnect();
            });
            
            this.player.on(AudioPlayerStatus.Idle, () => {
                if (!this.paused && this.playing) {
                    this.playNext();
                }
            });
            
            this.player.on('error', (error) => {
                console.error('Audio player error:', error);
                this.playNext();
            });
            
            this.reconnectAttempts = 0;
        } catch (error) {
            console.error('Error connecting to voice channel:', error);
            throw error;
        }
    }

    async reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.destroy();
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        try {
            if (this.connection) {
                this.connection.destroy();
            }
            
            this.connection = joinVoiceChannel({
                channelId: this.voiceChannel.id,
                guildId: this.guildId,
                adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
            });
            
            this.connection.subscribe(this.player);
            
            if (this.playing && !this.paused) {
                const currentSong = this.songs[0] || this.songs[this.songs.length - 1];
                if (currentSong) {
                    await this.playSong(currentSong);
                }
            }
            
            this.reconnectAttempts = 0;
        } catch (error) {
            console.error('Reconnect failed:', error);
            setTimeout(() => this.reconnect(), 5000);
        }
    }

    async addSong(song, user) {
        // Debug: Log song object
        console.log('DEBUG: addSong called with song:', {
            title: song?.title,
            url: song?.url,
            source: song?.source,
            hasUrl: !!song?.url,
            urlType: typeof song?.url,
            fullSong: song
        });
        
        // Validate song has required fields
        if (!song || !song.title || !song.url || !song.url.startsWith('http')) {
            console.error('Invalid song data:', song);
            throw new Error('Invalid song data: missing title or URL');
        }
        
        const track = {
            title: song.title,
            url: song.url,
            duration: song.duration,
            durationMs: song.durationMs || 0,
            thumbnail: song.thumbnail,
            requestedBy: user,
            source: song.source,
            artist: song.artist || '',
            plays: 0
        };
        
        console.log('DEBUG: Created track object:', {
            trackTitle: track.title,
            trackUrl: track.url,
            trackSource: track.source,
            hasTrackUrl: !!track.url,
            trackUrlType: typeof track.url,
            trackObject: track
        });
        
        this.songs.push(track);
        
        // Temporarily disable pre-buffering to test main playback
        if (this.songs.length === 1 && !this.playing) {
            // First song - play immediately without pre-buffering
            setTimeout(() => this.playNext(), 100);
        } else if (this.songs.length >= 2) {
            // Additional songs - no pre-buffering for now
            console.log('DEBUG: Skipping pre-buffering for now');
        }
        
        this.updateStat('songsAdded', 1);
        
        return track;
    }

    async playNext() {
        if (this.leaveTimeout) {
            clearTimeout(this.leaveTimeout);
            this.leaveTimeout = null;
        }

        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        if (this.songs.length === 0) {
            this.playing = false;
            if (!config.stayInChannel && this.connection) {
                this.leaveTimeout = setTimeout(() => {
                    this.destroy();
                }, config.autoLeaveTimeout);
            }
            return;
        }

        let song;
        if (this.loop === 'song' && this.songs[0]) {
            song = this.songs[0];
        } else {
            song = this.songs.shift();
            if (this.loop === 'queue') {
                this.songs.push(song);
            }
        }

        console.log('DEBUG: playNext selected song:', {
            songTitle: song?.title,
            songUrl: song?.url,
            songSource: song?.source,
            hasSongUrl: !!song?.url,
            songUrlType: typeof song?.url,
            songObject: song,
            songsArrayLength: this.songs.length
        });

        try {
            await this.playSong(song);
        } catch (error) {
            console.error('Error playing song:', error);
            this.playNext();
        }
    }

    
    applyEqualizer(resource) {
        const bands = resource.encoder?.filters;
        if (!bands) return;
        
        switch (this.equalizer) {
            case 'bass':
                bands.setEqualizer([0.2, 0.3, 0.4, 0.3, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
                break;
            case 'treble':
                bands.setEqualizer([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
                break;
            case 'vocal':
                bands.setEqualizer([0.5, 0.5, 0.5, 0.7, 0.8, 0.8, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
                break;
            case 'piano':
                bands.setEqualizer([0.4, 0.4, 0.5, 0.6, 0.7, 0.7, 0.7, 0.6, 0.5, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4]);
                break;
            default:
                bands.setEqualizer(Array(15).fill(0.1));
        }
    }

    startProgressBar() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        this.progressInterval = setInterval(() => {
            if (this.nowPlayingMessage && this.startTime && this.currentDuration) {
                const elapsed = Date.now() - this.startTime;
                const progress = Math.min(elapsed / this.currentDuration, 1);
                const barLength = 20;
                const filledBars = Math.floor(progress * barLength);
                const emptyBars = barLength - filledBars;
                
                const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
                const currentTime = this.formatTime(elapsed);
                const totalTime = this.formatTime(this.currentDuration);
                
                const embed = this.nowPlayingMessage.embeds[0];
                const newEmbed = EmbedBuilder.from(embed)
                    .setFields([
                        { name: 'Progress', value: `${progressBar} ${currentTime} / ${totalTime}`, inline: false },
                        ...embed.fields.slice(1)
                    ]);
                
                this.nowPlayingMessage.edit({ embeds: [newEmbed] }).catch(console.error);
            }
        }, 5000);
    }

    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    async updateNowPlaying(song) {
        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎵 Now Playing')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: 'Progress', value: '░░░░░░░░░░░░░░░░░░░░░ 0:00 / ' + song.duration, inline: false },
                { name: 'Duration', value: song.duration, inline: true },
                { name: 'Requested by', value: song.requestedBy.toString(), inline: true },
                { name: 'Source', value: song.source.charAt(0).toUpperCase() + song.source.slice(1), inline: true },
                { name: 'Equalizer', value: this.equalizer.charAt(0).toUpperCase() + this.equalizer.slice(1), inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('pause')
                    .setLabel('⏸️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('resume')
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('skip')
                    .setLabel('⏭️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('stop')
                    .setLabel('⏹️')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('queue')
                    .setLabel('📋')
                    .setStyle(ButtonStyle.Primary)
            );

        const eqRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('eq')
                    .setPlaceholder('Equalizer Presets')
                    .addOptions([
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Flat')
                            .setValue('flat')
                            .setDescription('Normal equalizer'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Bass Boost')
                            .setValue('bass')
                            .setDescription('Enhanced bass'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Treble Boost')
                            .setValue('treble')
                            .setDescription('Enhanced treble'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Vocal')
                            .setValue('vocal')
                            .setDescription('Vocal focus'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Piano')
                            .setValue('piano')
                            .setDescription('Piano optimized')
                    ])
            );

        if (this.nowPlayingMessage) {
            this.nowPlayingMessage.edit({ embeds: [embed], components: [row, eqRow] });
        } else {
            this.nowPlayingMessage = await this.textChannel.send({ embeds: [embed], components: [row, eqRow] });
        }

        const collector = this.nowPlayingMessage.createMessageComponentCollector({ 
            componentType: ComponentType.Button,
            time: 600000 
        });

        collector.on('collect', async (interaction) => {
            if (!interaction.member.voice.channel) {
                await interaction.reply({ content: 'You need to be in a voice channel!', ephemeral: true });
                return;
            }

            const djRole = client.djRoles.get(this.guildId);
            if (djRole && !interaction.member.roles.cache.has(djRole.id) && 
                ['pause', 'resume', 'skip', 'stop'].includes(interaction.customId)) {
                await interaction.reply({ content: 'You need the DJ role to use this command!', ephemeral: true });
                return;
            }

            switch (interaction.customId) {
                case 'pause':
                    this.pause();
                    await interaction.reply({ content: '⏸️ Paused', ephemeral: true });
                    break;
                case 'resume':
                    this.resume();
                    await interaction.reply({ content: '▶️ Resumed', ephemeral: true });
                    break;
                case 'skip':
                    this.playNext();
                    await interaction.reply({ content: '⏭️ Skipped', ephemeral: true });
                    break;
                case 'stop':
                    this.stop();
                    await interaction.reply({ content: '⏹️ Stopped', ephemeral: true });
                    break;
                case 'queue':
                    await this.showQueue(interaction);
                    break;
            }
        });

        const selectCollector = this.nowPlayingMessage.createMessageComponentCollector({ 
            componentType: ComponentType.StringSelect,
            time: 600000 
        });

        selectCollector.on('collect', async (interaction) => {
            if (!interaction.member.voice.channel) {
                await interaction.reply({ content: 'You need to be in a voice channel!', ephemeral: true });
                return;
            }

            this.equalizer = interaction.values[0];
            if (this.playing && !this.paused) {
                const currentSong = this.songs[0] || this.songs[this.songs.length - 1];
                if (currentSong) {
                    await this.playSong(currentSong);
                }
            }
            await interaction.reply({ content: `🎛️ Equalizer set to ${this.equalizer}`, ephemeral: true });
        });
    }

    pause() {
        this.player.pause();
        this.paused = true;
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
    }

    resume() {
        this.player.unpause();
        this.paused = false;
        this.startProgressBar();
    }

    stop() {
        this.songs = [];
        this.playing = false;
        this.player.stop();
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        this.destroy();
    }

    destroy() {
        if (this.connection) {
            this.connection.destroy();
        }
        if (this.nowPlayingMessage) {
            this.nowPlayingMessage.delete();
            this.nowPlayingMessage = null;
        }
        if (this.leaveTimeout) {
            clearTimeout(this.leaveTimeout);
        }
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        client.queues.delete(this.guildId);
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(config.maxVolume, volume));
        if (this.player.state.status !== AudioPlayerStatus.Idle) {
            this.player.state.resource.volume.setVolume(this.volume / 100);
        }
    }

    shuffle() {
        for (let i = this.songs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.songs[i], this.songs[j]] = [this.songs[j], this.songs[i]];
        }
    }

    addVoteSkip(userId) {
        const voiceMembers = this.voiceChannel.members.filter(m => !m.user.bot).size;
        const requiredVotes = Math.ceil(voiceMembers / 2);
        
        this.voteSkips.add(userId);
        
        if (this.voteSkips.size >= requiredVotes) {
            this.playNext();
            this.voteSkips.clear();
            return { success: true, skipped: true };
        }
        
        return { success: true, skipped: false, votes: this.voteSkips.size, required: requiredVotes };
    }

    async showQueue(interaction, page = 1) {
        if (this.songs.length === 0) {
            return interaction.reply({ content: 'The queue is empty!', ephemeral: true });
        }

        const perPage = 10;
        const maxPage = Math.ceil(this.songs.length / perPage);
        page = Math.max(1, Math.min(page, maxPage));
        
        const start = (page - 1) * perPage;
        const end = start + perPage;
        const queueSongs = this.songs.slice(start, end);
        
        const totalDuration = this.songs.reduce((acc, song) => acc + (song.durationMs || 0), 0);
        
        const queueEmbed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎵 Current Queue')
            .setDescription(
                queueSongs.map((song, index) => 
                    `${start + index + 1}. **${song.title}** - ${song.duration} - ${song.requestedBy.toString()}`
                ).join('\n')
            )
            .addFields(
                { name: 'Total Songs', value: this.songs.length.toString(), inline: true },
                { name: 'Total Duration', value: this.formatTime(totalDuration), inline: true },
                { name: 'Now Playing', value: this.playing ? 'Yes' : 'No', inline: true },
                { name: 'Volume', value: `${this.volume}%`, inline: true },
                { name: 'Loop Mode', value: this.loop, inline: true },
                { name: 'Page', value: `${page}/${maxPage}`, inline: true }
            )
            .setFooter({ text: `Use the buttons below to navigate the queue` });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('queue_prev')
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1),
                new ButtonBuilder()
                    .setCustomId('queue_next')
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === maxPage),
                new ButtonBuilder()
                    .setCustomId('queue_refresh')
                    .setLabel('🔄')
                    .setStyle(ButtonStyle.Secondary)
            );

        const reply = await interaction.reply({ 
            embeds: [queueEmbed], 
            components: [row],
            ephemeral: true,
            fetchReply: true 
        });

        const collector = reply.createMessageComponentCollector({ 
            componentType: ComponentType.Button,
            time: 300000 
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: 'Only the command author can use these buttons!', ephemeral: true });
                return;
            }

            if (i.customId === 'queue_prev') {
                await this.showQueue(interaction, page - 1);
                collector.stop();
            } else if (i.customId === 'queue_next') {
                await this.showQueue(interaction, page + 1);
                collector.stop();
            } else if (i.customId === 'queue_refresh') {
                await this.showQueue(interaction, page);
                collector.stop();
            }
        });
    }

    updateStat(stat, value = 1) {
        const guildStats = client.stats.get(this.guildId) || {
            songsPlayed: 0,
            songsAdded: 0,
            commandsUsed: 0,
            totalPlayTime: 0,
            mostPlayed: new Map()
        };
        
        guildStats[stat] += value;
        client.stats.set(this.guildId, guildStats);
    }
}

client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    client.user.setPresence({
        activities: [{ name: '/play | Music Bot', type: 2 }],
        status: 'online'
    });
    
    try {
        await client.application.commands.set(commands);
        console.log('Commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
    
    setInterval(() => {
        client.user.setPresence({
            activities: [{ name: `/play | ${client.queues.size} servers`, type: 2 }],
            status: 'online'
        });
    }, 300000);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, guild, channel } = interaction;
    
    // Auto-detect music control channel
    const musicControlChannel = guild.channels.cache.find(c => 
        c.name.toLowerCase().includes('music') && 
        c.name.toLowerCase().includes('control') && 
        c.isTextBased()
    );
    
    // Restrict music commands to music-control channel
    const musicCommands = ['play', 'skip', 'voteskip', 'queue', 'nowplaying', 'volume', 'pause', 'resume', 'stop', 'loop', 'shuffle', 'remove', 'eq', 'playlist-save', 'playlist-load', 'playlist-list'];
    if (musicCommands.includes(commandName) && musicControlChannel && channel.id !== musicControlChannel.id) {
        return interaction.reply({ 
            content: `❌ Music commands can only be used in ${musicControlChannel}!`, 
            ephemeral: true 
        });
    }

    const voiceChannel = member.voice.channel;

    const cooldownKey = `${commandName}-${member.id}-${guild.id}`;
    const now = Date.now();
    const cooldownAmount = commandName === 'play' ? 3000 : 1000;

    if (client.cooldowns.has(cooldownKey)) {
        const expirationTime = client.cooldowns.get(cooldownKey) + cooldownAmount;
        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return interaction.reply({ 
                content: `Please wait ${timeLeft.toFixed(1)} more seconds before using this command again!`, 
                ephemeral: true 
            });
        }
    }

    client.cooldowns.set(cooldownKey, now);
    setTimeout(() => client.cooldowns.delete(cooldownKey), cooldownAmount);

    if (!voiceChannel && commandName !== 'queue' && commandName !== 'nowplaying' && 
        commandName !== 'stats' && !commandName.startsWith('playlist-') && 
        commandName !== 'announce' && commandName !== 'djrole') {
        return interaction.reply({ content: 'You need to be in a voice channel!', ephemeral: true });
    }

    let queue = client.queues.get(guild.id);
    
    if (commandName === 'play') {
        const query = options.getString('query');
        const filter = options.getString('filter');
        
        if (!queue) {
            // Auto-detect music voice channel
            const musicVoiceChannel = guild.channels.cache.find(c => 
                c.name.toLowerCase().includes('music') && 
                c.isVoiceBased()
            ) || voiceChannel; // Fallback to user's channel if no music channel found
            
            queue = new MusicQueue(guild.id, musicVoiceChannel, channel);
            client.queues.set(guild.id, queue);
            await queue.connect();
            
            // Notify user if using different channel
            if (musicVoiceChannel.id !== voiceChannel.id) {
                await interaction.followUp({ 
                    content: `🎵 Joining ${musicVoiceChannel} for music playback!`, 
                    ephemeral: true 
                });
            }
        }

        await interaction.deferReply();

        try {
            if (query.includes('spotify.com')) {
                const spotifyData = await getPreview(query);
                
                if (query.includes('/playlist/')) {
                    const tracks = spotifyData.tracks.items.map(item => ({
                        title: item.track.name,
                        artist: item.track.artists[0].name,
                        duration: `${Math.floor(item.track.duration_ms / 60000)}:${Math.floor((item.track.duration_ms % 60000) / 1000).toString().padStart(2, '0')}`,
                        durationMs: item.track.duration_ms,
                        thumbnail: item.track.album.images[0].url,
                        url: item.track.external_urls.spotify,
                        source: 'spotify'
                    }));
                    
                    for (const track of tracks) {
                        await queue.addSong(track, member);
                    }
                    
                    await interaction.editReply(`🎵 Added ${tracks.length} songs from Spotify playlist to the queue!`);
                } else {
                    const track = spotifyData.track;
                    const song = {
                        title: track.name,
                        artist: track.artists[0].name,
                        duration: `${Math.floor(track.duration_ms / 60000)}:${Math.floor((track.duration_ms % 60000) / 1000).toString().padStart(2, '0')}`,
                        durationMs: track.duration_ms,
                        thumbnail: track.album.images[0].url,
                        url: track.external_urls.spotify,
                        source: 'spotify'
                    };
                    
                    await queue.addSong(song, member);
                    await interaction.editReply(`🎵 Added **${song.title}** to the queue!`);
                }
            } else if (query.includes('soundcloud.com')) {
                const soundcloudInfo = await playdl.soundcloud(query);
                
                if (query.includes('/sets/')) {
                    const tracks = await playdl.soundcloud(query);
                    for (const track of tracks) {
                        const song = {
                            title: track.name,
                            duration: track.durationRaw,
                            durationMs: track.durationInMs,
                            thumbnail: track.thumbnail,
                            url: track.url,
                            source: 'soundcloud'
                        };
                        await queue.addSong(song, member);
                    }
                    await interaction.editReply(`🎵 Added ${tracks.length} songs from SoundCloud set to the queue!`);
                } else {
                    const song = {
                        title: soundcloudInfo.name,
                        duration: soundcloudInfo.durationRaw,
                        durationMs: soundcloudInfo.durationInMs,
                        thumbnail: soundcloudInfo.thumbnail,
                        url: soundcloudInfo.url,
                        source: 'soundcloud'
                    };
                    
                    await queue.addSong(song, member);
                    await interaction.editReply(`🎵 Added **${song.title}** to the queue!`);
                }
            } else if (query.includes('youtube.com') || query.includes('youtu.be')) {
                const videoInfo = await playdl.video_info(query);
                const video = videoInfo.video_details;
                const song = {
                    title: video.title,
                    duration: video.durationRaw,
                    durationMs: video.durationInSec * 1000,
                    thumbnail: video.thumbnails[0].url,
                    url: video.url,
                    source: 'youtube'
                };
                
                await queue.addSong(song, member);
                await interaction.editReply(`🎵 Added **${song.title}** to the queue!`);
            } else {
                let searchOptions = { limit: 10, source: 'youtube' };
                
                if (filter) {
                    switch (filter) {
                        case 'short':
                            searchOptions.filter = 'short';
                            break;
                        case 'medium':
                            searchOptions.filter = 'medium';
                            break;
                        case 'long':
                            searchOptions.filter = 'long';
                            break;
                        case 'week':
                            searchOptions.date = 'week';
                            break;
                        case 'month':
                            searchOptions.date = 'month';
                            break;
                        case 'year':
                            searchOptions.date = 'year';
                            break;
                        case 'views':
                            searchOptions.sortBy = 'views';
                            break;
                    }
                }
                
                const searchResults = await playdl.search(query, searchOptions);
                if (searchResults.length === 0) {
                    return interaction.editReply('No results found!');
                }
                
                const video = searchResults[0];
                
                // Validate video object has required fields
                if (!video || !video.title || !video.url) {
                    console.error('Invalid video object from search:', video);
                    return interaction.editReply('Error: Invalid video data received from search!');
                }
                
                const song = {
                    title: video.title,
                    duration: video.durationRaw,
                    durationMs: video.durationInSec * 1000,
                    thumbnail: video.thumbnails && video.thumbnails[0] ? video.thumbnails[0].url : '',
                    url: video.url,
                    source: 'youtube'
                };
                
                console.log('DEBUG: Created song from video:', {
                    videoTitle: video.title,
                    videoUrl: video.url,
                    songTitle: song.title,
                    songUrl: song.url,
                    videoObject: video
                });
                
                await queue.addSong(song, member);
                await interaction.editReply(`🎵 Added **${song.title}** to the queue!`);
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('Error playing the song. Please try again.');
        }
    } else if (commandName === 'skip') {
        if (!queue) return interaction.reply({ content: 'No song is currently playing!', ephemeral: true });
        
        const djRole = client.djRoles.get(guild.id);
        if (djRole && !member.roles.cache.has(djRole.id)) {
            return interaction.reply({ content: 'You need the DJ role to skip songs!', ephemeral: true });
        }
        
        queue.playNext();
        await interaction.reply('⏭️ Skipped!');
    } else if (commandName === 'voteskip') {
        if (!queue) return interaction.reply({ content: 'No song is currently playing!', ephemeral: true });
        
        const result = queue.addVoteSkip(member.id);
        if (result.skipped) {
            await interaction.reply('⏭️ Vote skip passed! Skipping song...');
        } else {
            await interaction.reply(`🗳️ Vote to skip: ${result.votes}/${result.required} votes`);
        }
    } else if (commandName === 'queue') {
        if (!queue || queue.songs.length === 0) {
            return interaction.reply({ content: 'The queue is empty!', ephemeral: true });
        }
        
        await queue.showQueue(interaction);
    } else if (commandName === 'nowplaying') {
        if (!queue || !queue.playing) {
            return interaction.reply({ content: 'No song is currently playing!', ephemeral: true });
        }
        
        const currentSong = queue.songs[0] || queue.songs[queue.songs.length - 1];
        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎵 Now Playing')
            .setDescription(`**${currentSong.title}**`)
            .addFields(
                { name: 'Duration', value: currentSong.duration, inline: true },
                { name: 'Requested by', value: currentSong.requestedBy.toString(), inline: true },
                { name: 'Source', value: currentSong.source.charAt(0).toUpperCase() + currentSong.source.slice(1), inline: true },
                { name: 'Equalizer', value: queue.equalizer.charAt(0).toUpperCase() + queue.equalizer.slice(1), inline: true }
            )
            .setThumbnail(currentSong.thumbnail);
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (commandName === 'volume') {
        if (!queue) return interaction.reply({ content: 'No song is currently playing!', ephemeral: true });
        
        const volume = options.getInteger('amount');
        queue.setVolume(volume);
        await interaction.reply(`🔊 Volume set to ${volume}%`);
    } else if (commandName === 'pause') {
        if (!queue) return interaction.reply({ content: 'No song is currently playing!', ephemeral: true });
        
        queue.pause();
        await interaction.reply('⏸️ Paused');
    } else if (commandName === 'resume') {
        if (!queue) return interaction.reply({ content: 'No song is currently playing!', ephemeral: true });
        
        queue.resume();
        await interaction.reply('▶️ Resumed');
    } else if (commandName === 'stop') {
        if (!queue) return interaction.reply({ content: 'No song is currently playing!', ephemeral: true });
        
        queue.stop();
        await interaction.reply('⏹️ Stopped');
    } else if (commandName === 'loop') {
        if (!queue) return interaction.reply({ content: 'No song is currently playing!', ephemeral: true });
        
        const mode = options.getString('mode');
        queue.loop = mode;
        await interaction.reply(`🔁 Loop mode set to ${mode}`);
    } else if (commandName === 'shuffle') {
        if (!queue || queue.songs.length === 0) {
            return interaction.reply({ content: 'The queue is empty!', ephemeral: true });
        }
        
        queue.shuffle();
        await interaction.reply('🔀 Queue shuffled!');
    } else if (commandName === 'remove') {
        if (!queue || queue.songs.length === 0) {
            return interaction.reply({ content: 'The queue is empty!', ephemeral: true });
        }
        
        const index = options.getInteger('index') - 1;
        if (index < 0 || index >= queue.songs.length) {
            return interaction.reply({ content: 'Invalid song index!', ephemeral: true });
        }
        
        const removed = queue.songs.splice(index, 1)[0];
        await interaction.reply(`🗑️ Removed **${removed.title}** from the queue`);
    } else if (commandName === 'eq') {
        if (!queue) return interaction.reply({ content: 'No song is currently playing!', ephemeral: true });
        
        const preset = options.getString('preset');
        queue.equalizer = preset;
        
        if (queue.playing && !queue.paused) {
            const currentSong = queue.songs[0] || queue.songs[queue.songs.length - 1];
            if (currentSong) {
                await queue.playSong(currentSong);
            }
        }
        
        await interaction.reply(`🎛️ Equalizer set to ${preset}`);
    } else if (commandName === 'playlist-save') {
        if (!queue || queue.songs.length === 0) {
            return interaction.reply({ content: 'The queue is empty!', ephemeral: true });
        }
        
        const name = options.getString('name');
        const playlistData = {
            name: name,
            songs: queue.songs,
            created: new Date().toISOString()
        };
        
        if (!fs.existsSync('./playlists')) {
            fs.mkdirSync('./playlists');
        }
        
        fs.writeFileSync(`./playlists/${name}.json`, JSON.stringify(playlistData, null, 2));
        await interaction.reply(`💾 Playlist "${name}" saved!`);
    } else if (commandName === 'playlist-load') {
        const name = options.getString('name');
        
        if (!fs.existsSync(`./playlists/${name}.json`)) {
            return interaction.reply({ content: `Playlist "${name}" not found!`, ephemeral: true });
        }
        
        if (!queue) {
            // Auto-detect music voice channel
            const musicVoiceChannel = guild.channels.cache.find(c => 
                c.name.toLowerCase().includes('music') && 
                c.isVoiceBased()
            ) || voiceChannel; // Fallback to user's channel if no music channel found
            
            queue = new MusicQueue(guild.id, musicVoiceChannel, channel);
            client.queues.set(guild.id, queue);
            await queue.connect();
            
            // Notify user if using different channel
            if (musicVoiceChannel.id !== voiceChannel.id) {
                await interaction.followUp({ 
                    content: `🎵 Joining ${musicVoiceChannel} for music playback!`, 
                    ephemeral: true 
                });
            }
        }
        
        const playlistData = JSON.parse(fs.readFileSync(`./playlists/${name}.json`));
        
        for (const song of playlistData.songs) {
            await queue.addSong(song, member);
        }
        
        await interaction.reply(`📂 Loaded playlist "${name}" with ${playlistData.songs.length} songs!`);
    } else if (commandName === 'playlist-list') {
        if (!fs.existsSync('./playlists')) {
            return interaction.reply({ content: 'No playlists found!', ephemeral: true });
        }
        
        const files = fs.readdirSync('./playlists').filter(file => file.endsWith('.json'));
        
        if (files.length === 0) {
            return interaction.reply({ content: 'No playlists found!', ephemeral: true });
        }
        
        const playlists = files.map(file => {
            const data = JSON.parse(fs.readFileSync(`./playlists/${file}`));
            return `- **${data.name}** (${data.songs.length} songs)`;
        }).join('\n');
        
        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎵 Saved Playlists')
            .setDescription(playlists);
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (commandName === 'stats') {
        const stats = client.stats.get(guild.id) || {
            songsPlayed: 0,
            songsAdded: 0,
            commandsUsed: 0,
            totalPlayTime: 0,
            mostPlayed: new Map()
        };
        
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('📊 Music Statistics')
            .addFields(
                { name: 'Songs Played', value: stats.songsPlayed.toString(), inline: true },
                { name: 'Songs Added', value: stats.songsAdded.toString(), inline: true },
                { name: 'Commands Used', value: stats.commandsUsed.toString(), inline: true },
                { name: 'Bot Uptime', value: `${days}d ${hours}h ${minutes}m`, inline: true },
                { name: 'Active Servers', value: client.queues.size.toString(), inline: true },
                { name: 'Total Play Time', value: queue.formatTime(stats.totalPlayTime), inline: true }
            );
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (commandName === 'performance') {
        if (!queue) {
            return interaction.reply({ content: 'No active music session!', ephemeral: true });
        }
        
        const cacheStats = queue.getCacheStats();
        const stats = client.stats.get(guild.id) || {
            songsPlayed: 0,
            cacheHits: 0
        };
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('⚡ Instant Playback Performance')
            .setDescription('**Advanced caching and pre-buffering stats**')
            .addFields(
                { name: '🎵 Pre-buffered Songs', value: `${cacheStats.preBufferedSongs}/${cacheStats.maxCacheSize}`, inline: true },
                { name: '💾 Cache Hit Rate', value: `${cacheStats.cacheHitRate}%`, inline: true },
                { name: '⚡ Next Song Ready', value: cacheStats.nextSongPreBuffered ? '✅ Yes' : '⏳ No', inline: true },
                { name: '🔄 Currently Pre-buffering', value: cacheStats.preBuffering ? '✅ Yes' : '⏸️ No', inline: true },
                { name: '📊 Total Plays', value: (stats.songsPlayed || 0).toString(), inline: true },
                { name: '🎯 Cache Hits', value: (stats.cacheHits || 0).toString(), inline: true }
            )
            .setFooter({ text: 'Lower cache hit rates = faster instant playback!' });
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (commandName === 'announce') {
        const announceChannel = options.getChannel('channel');
        
        if (announceChannel) {
            if (!announceChannel.isTextBased()) {
                return interaction.reply({ content: 'Please select a text channel!', ephemeral: true });
            }
            client.announcements.set(guild.id, announceChannel);
            await interaction.reply(`📢 Music announcements will now be sent in ${announceChannel}`);
        } else {
            client.announcements.delete(guild.id);
            await interaction.reply('🔇 Music announcements disabled');
        }
    } else if (commandName === 'djrole') {
        const djRole = options.getRole('role');
        
        if (djRole) {
            client.djRoles.set(guild.id, djRole);
            await interaction.reply(`🎧 DJ role set to ${djRole}`);
        } else {
            client.djRoles.delete(guild.id);
            await interaction.reply('🚫 DJ role removed');
        }
    }
    
    if (queue) {
        queue.updateStat('commandsUsed', 1);
    }
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

client.login(config.token);