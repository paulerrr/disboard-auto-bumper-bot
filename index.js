require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const client = new Client();

// Get channel IDs from environment variables
const disboardChannels = (process.env.DISBOARD_CHANNELS || '').split(',').filter(id => id.trim() !== '');
const discadiaChannels = (process.env.DISCADIA_CHANNELS || '').split(',').filter(id => id.trim() !== '');

// Hours (0-23) when Discadia should be bumped
// Default to 9 (9 AM in the server's local time)
const discadiaBumpHour = parseInt(process.env.DISCADIA_BUMP_HOUR || '9');

// Configure specific channels for each service
const BUMP_CONFIG = {
    DISBOARD: {
        id: '302050872383242240',
        command: 'bump',
        interval: 2.1 * 60 * 60 * 1000, // 2.1 hours in milliseconds
        channels: disboardChannels, // Disboard bump channels
        lastBumped: {} // Timestamp of when this bot was last bumped in each channel
    },
    DISCADIA: {
        id: '1222548162741538938',
        command: 'bump',
        interval: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        channels: discadiaChannels, // Discadia bump channels
        lastBumped: {}, // Timestamp of when this bot was last bumped in each channel
        bumpHour: discadiaBumpHour // Hour of the day to bump (in 24-hour format, server's local time)
    }
};

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Validate configuration
    let validConfig = true;
    for (const [serviceName, config] of Object.entries(BUMP_CONFIG)) {
        if (!config.channels.length) {
            console.error(`ERROR: No channels configured for ${serviceName}. Please set ${serviceName}_CHANNELS in .env file.`);
            validConfig = false;
        }
    }
    
    if (!validConfig) {
        console.error('Bot cannot start due to configuration errors. Check .env file.');
        process.exit(1);
    }

    // Initialize lastBumped for each channel
    for (const config of Object.values(BUMP_CONFIG)) {
        config.channels.forEach(channelId => {
            if (!config.lastBumped[channelId]) {
                config.lastBumped[channelId] = 0;
            }
        });
    }

    // Function to check if it's time to bump Discadia based on the hour of day
    function isDiscadiaBumpTime(channelId) {
        const now = new Date();
        const currentHour = now.getHours();
        
        // Check if it's the right hour
        if (currentHour === BUMP_CONFIG.DISCADIA.bumpHour) {
            // Check if we've already bumped today in this channel
            if (BUMP_CONFIG.DISCADIA.lastBumped[channelId] > 0) {
                const lastBump = new Date(BUMP_CONFIG.DISCADIA.lastBumped[channelId]);
                // If we've already bumped today, skip
                if (lastBump.getDate() === now.getDate() && 
                    lastBump.getMonth() === now.getMonth() && 
                    lastBump.getFullYear() === now.getFullYear()) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    // Function to bump a specific bot in a specific channel
    async function bumpBot(channelId, botName, botConfig) {
        try {
            // Special handling for Discadia's scheduled bump
            if (botName === 'DISCADIA') {
                if (!isDiscadiaBumpTime(channelId)) {
                    console.log(`Skipping Discadia bump in channel ${channelId} - will bump at ${botConfig.bumpHour}:00 today`);
                    return false;
                }
            } else {
                // For interval-based services like Disboard, check if enough time has passed
                const now = Date.now();
                if (now - botConfig.lastBumped[channelId] < botConfig.interval) {
                    // Calculate remaining time until next bump
                    const timeRemaining = botConfig.interval - (now - botConfig.lastBumped[channelId]);
                    const hoursRemaining = Math.floor(timeRemaining / (60 * 60 * 1000));
                    const minutesRemaining = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
                    console.log(`Skipping ${botName} bump in channel ${channelId} - next bump available in ${hoursRemaining}h ${minutesRemaining}m`);
                    return false; // Didn't bump because it's not time yet
                }
            }
            
            const channel = await client.channels.fetch(channelId);
            if (channel) {
                await channel.sendSlash(botConfig.id, botConfig.command);
                botConfig.lastBumped[channelId] = Date.now(); // Update the last bumped timestamp for this channel
                console.log(`Bumped ${botName} in channel ${channelId}!`);
                return true; // Successfully bumped
            } else {
                console.error(`Channel not found: ${channelId}`);
                return false;
            }
        } catch (error) {
            console.error(`Error bumping ${botName} in channel ${channelId}:`, error.message);
            return false;
        }
    }

    // Function to bump all services in their respective channels
    async function bumpAllServices() {
        for (const [serviceName, config] of Object.entries(BUMP_CONFIG)) {
            for (const channelId of config.channels) {
                await bumpBot(channelId, serviceName, config);
                // Add a small delay between bumps to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    // Function to calculate next check time
    function calculateNextCheckTime() {
        // Check every 20-30 minutes
        return Math.round(Math.random() * (30 * 60 * 1000 - 20 * 60 * 1000)) + 20 * 60 * 1000;
    }

    // Function to loop the bumping process
    function loop() {
        const checkInterval = calculateNextCheckTime();
        const minutes = Math.floor(checkInterval / 60000);
        
        console.log(`Next bump check in ${minutes} minutes`);
        
        setTimeout(async () => {
            await bumpAllServices();
            loop();
        }, checkInterval);
    }

    // Format time for display (12-hour format)
    function formatHour(hour) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12; // Convert 0 to 12 for 12 AM
        return `${hour12}:00 ${period}`;
    }

    // Print initial status message
    console.log('Auto-bump bot started!');
    console.log('Configured services:');
    console.log(`- Disboard: ${BUMP_CONFIG.DISBOARD.channels.length} channel(s): ${BUMP_CONFIG.DISBOARD.channels.join(', ')} (bumps every 2 hours)`);
    console.log(`- Discadia: ${BUMP_CONFIG.DISCADIA.channels.length} channel(s): ${BUMP_CONFIG.DISCADIA.channels.join(', ')} (bumps daily at ${formatHour(BUMP_CONFIG.DISCADIA.bumpHour)})`);

    // Start the bumping process
    await bumpAllServices();
    loop();
});

client.login(process.env.TOKEN);