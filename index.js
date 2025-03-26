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
        interval: 3 * 24 * 60 * 60 * 1000, // 3 days in milliseconds for safety
        channels: discadiaChannels, // Discadia bump channels
        lastBumped: {}, // Timestamp of when this bot was last bumped in each channel
        bumpHour: discadiaBumpHour, // Hour of the day to bump (in 24-hour format, server's local time)
        lastResponse: {}, // Last response from Discadia for each channel
        cooldownActive: {}, // Track if we're in a cooldown period for each channel
        retryCount: {}, // Track retry attempts for each channel
        nextScheduledAttempt: {} // Store timeout IDs for scheduled attempts
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

    // Initialize configurations for each channel
    for (const [serviceName, config] of Object.entries(BUMP_CONFIG)) {
        config.channels.forEach(channelId => {
            if (!config.lastBumped[channelId]) {
                config.lastBumped[channelId] = 0;
            }
            
            // Initialize Discadia-specific tracking
            if (serviceName === 'DISCADIA') {
                if (!config.lastResponse[channelId]) config.lastResponse[channelId] = '';
                if (!config.cooldownActive[channelId]) config.cooldownActive[channelId] = false;
                if (!config.retryCount[channelId]) config.retryCount[channelId] = 0;
            }
        });
    }

    // Set up message listener to capture Discadia responses
    client.on('messageCreate', async (message) => {
        // Only process messages from Discadia bot
        if (message.author.id !== BUMP_CONFIG.DISCADIA.id) return;
        
        // Check if this is in a channel we're monitoring
        const channelId = message.channel.id;
        if (!BUMP_CONFIG.DISCADIA.channels.includes(channelId)) return;
        
        // Store the response
        BUMP_CONFIG.DISCADIA.lastResponse[channelId] = message.content;
        
        // Check if this is a successful bump
        if (message.content.includes('has been successfully bumped')) {
            BUMP_CONFIG.DISCADIA.lastBumped[channelId] = Date.now();
            BUMP_CONFIG.DISCADIA.cooldownActive[channelId] = false;
            BUMP_CONFIG.DISCADIA.retryCount[channelId] = 0;
            console.log(`Confirmed successful Discadia bump in channel ${channelId}!`);
            
            // Reschedule next bump based on standard cooldown (24 hours plus safety)
            scheduleNextDiscadiaBump(channelId);
        }
        
        // Check if we're in a cooldown period
        if (message.content.includes('Already bumped recently')) {
            BUMP_CONFIG.DISCADIA.cooldownActive[channelId] = true;
            
            // Extract cooldown time if possible
            // Handle both "try again X days/hours ago" and "try again in X day/hour" formats
            let cooldownMatch = message.content.match(/try again (\d+) (hours?|days?) ago/);
            if (!cooldownMatch) {
                cooldownMatch = message.content.match(/try again in (\d+) (hours?|days?)/);
            }
            
            if (cooldownMatch) {
                const value = parseInt(cooldownMatch[1]);
                const unit = cooldownMatch[2];
                
                let cooldownMs = 0;
                if (unit.startsWith('hour')) {
                    cooldownMs = value * 60 * 60 * 1000;
                } else if (unit.startsWith('day')) {
                    cooldownMs = value * 24 * 60 * 60 * 1000;
                }
                
                // Add this to the current time as a safety margin and store it
                if (cooldownMs > 0) {
                    const nextEligibleTime = Date.now() + cooldownMs + 60 * 60 * 1000; // Add an extra hour for safety
                    BUMP_CONFIG.DISCADIA.lastBumped[channelId] = nextEligibleTime; 
                    console.log(`Discadia cooldown detected in channel ${channelId}. Next eligible time: ${new Date(nextEligibleTime).toLocaleString()}`);
                    
                    // Reschedule with the new cooldown information
                    scheduleNextDiscadiaBump(channelId);
                }
            } else {
                // If we can't parse the time, use a default 24-hour cooldown
                BUMP_CONFIG.DISCADIA.lastBumped[channelId] = Date.now() + 24 * 60 * 60 * 1000;
                
                // Reschedule with the default cooldown
                scheduleNextDiscadiaBump(channelId);
            }
        }
    });

    // Function to check if it's time to bump Discadia
    function isDiscadiaBumpTime(channelId) {
        const now = new Date();
        
        // Check if we're in a cooldown
        if (BUMP_CONFIG.DISCADIA.cooldownActive[channelId]) {
            // If last attempt was more than 12 hours ago, reset cooldown
            if (Date.now() - BUMP_CONFIG.DISCADIA.lastBumped[channelId] > 12 * 60 * 60 * 1000) {
                BUMP_CONFIG.DISCADIA.cooldownActive[channelId] = false;
            } else {
                return false;
            }
        }
        
        // Check if we've already bumped today in this channel
        const lastBumpTime = BUMP_CONFIG.DISCADIA.lastBumped[channelId];
        if (lastBumpTime > 0) {
            // If we're in a waiting period due to a previous failed attempt
            if (now.getTime() < lastBumpTime) {
                return false;
            }
        }
        
        // If it's the preferred hour (9 AM), always try to bump
        const currentHour = now.getHours();
        if (currentHour === BUMP_CONFIG.DISCADIA.bumpHour) {
            return true;
        }
        
        // Otherwise, only bump if the last bump was at least 22 hours ago
        // This prevents bumping too frequently but still allows bumping as soon as eligible
        const minTimeBetweenBumps = 22 * 60 * 60 * 1000; // 22 hours in milliseconds
        return (lastBumpTime === 0 || (now.getTime() - lastBumpTime) >= minTimeBetweenBumps);
    }

    // Function to bump a specific bot in a specific channel
    async function bumpBot(channelId, botName, botConfig) {
        try {
            // Special handling for Discadia's scheduled bump
            if (botName === 'DISCADIA') {
                if (!isDiscadiaBumpTime(channelId)) {
                    // If we have a future timestamp for next eligible bump, inform when we'll try
                    if (botConfig.lastBumped[channelId] > Date.now()) {
                        const nextTime = new Date(botConfig.lastBumped[channelId]);
                        console.log(`Skipping Discadia bump in channel ${channelId} - will try again on ${nextTime.toLocaleDateString()} at ${nextTime.toLocaleTimeString()}`);
                    } else {
                        console.log(`Skipping Discadia bump in channel ${channelId} - will bump at ${botConfig.bumpHour}:00 today`);
                    }
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
                
                // For non-Discadia services, update timestamp immediately
                // For Discadia, we update in the message listener for better accuracy
                if (botName !== 'DISCADIA') {
                    botConfig.lastBumped[channelId] = Date.now();
                } else {
                    // For Discadia, record that we attempted a bump
                    botConfig.retryCount[channelId]++;
                }
                
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

    // Function to calculate next check time for regular services
    function calculateNextCheckTime() {
        // Check every 20-30 minutes
        return Math.round(Math.random() * (30 * 60 * 1000 - 20 * 60 * 1000)) + 20 * 60 * 1000;
    }

    // Function to schedule the next Discadia bump based on cooldown
    function scheduleNextDiscadiaBump(channelId) {
        // Clear any existing timeout for this channel
        if (BUMP_CONFIG.DISCADIA.nextScheduledAttempt && BUMP_CONFIG.DISCADIA.nextScheduledAttempt[channelId]) {
            clearTimeout(BUMP_CONFIG.DISCADIA.nextScheduledAttempt[channelId]);
        }

        // Calculate when to try next
        let nextAttemptTime;
        let scheduledTimeDescription;
        
        // If we have a specific cooldown time from Discadia
        if (BUMP_CONFIG.DISCADIA.lastBumped[channelId] > Date.now()) {
            const cooldownExpiry = BUMP_CONFIG.DISCADIA.lastBumped[channelId];
            const now = new Date();
            const expiryDate = new Date(cooldownExpiry);
            
            // Calculate next preferred time (9 AM)
            const nextPreferredTime = new Date(now);
            nextPreferredTime.setHours(BUMP_CONFIG.DISCADIA.bumpHour, 0, 0, 0);
            
            // If it's already past 9 AM today, schedule for tomorrow
            if (now >= nextPreferredTime) {
                nextPreferredTime.setDate(nextPreferredTime.getDate() + 1);
            }
            
            // Calculate the day after next preferred time (9 AM the day after tomorrow)
            const dayAfterPreferredTime = new Date(nextPreferredTime);
            dayAfterPreferredTime.setDate(dayAfterPreferredTime.getDate() + 1);
            
            // NORMALIZATION LOGIC:
            // 1. If cooldown expires before next 9 AM, always use 9 AM 
            // 2. If cooldown expires after next 9 AM but before 9 AM the following day,
            //    check if we can use the following day's 9 AM (for normalization)
            
            if (expiryDate < nextPreferredTime) {
                // Cooldown expires before next 9 AM, use 9 AM
                nextAttemptTime = nextPreferredTime.getTime() - now.getTime();
                scheduledTimeDescription = `at preferred time (${nextPreferredTime.toLocaleString()})`;
            } 
            else if (expiryDate < dayAfterPreferredTime) {
                // Cooldown expires after next 9 AM but before 9 AM the day after
                
                // Check if cooldown expires before 3 PM on its day
                // If so, bump at cooldown expiry to try to normalize toward 9 AM
                const cooldownExpiryHour = expiryDate.getHours();
                
                if (cooldownExpiryHour < 15) { // Before 3 PM
                    // Use cooldown expiry time to try to get earlier
                    nextAttemptTime = cooldownExpiry - now.getTime() + (5 * 60 * 1000); // Add 5 min safety
                    scheduledTimeDescription = `at cooldown expiry (${new Date(cooldownExpiry + 5 * 60 * 1000).toLocaleString()}) to normalize toward morning`;
                } else {
                    // Use next day's 9 AM to normalize
                    nextAttemptTime = dayAfterPreferredTime.getTime() - now.getTime();
                    scheduledTimeDescription = `at next day's preferred time (${dayAfterPreferredTime.toLocaleString()}) to normalize`;
                }
            }
            else {
                // Cooldown expires after 9 AM two days from now - use that 9 AM
                nextAttemptTime = dayAfterPreferredTime.getTime() - now.getTime();
                scheduledTimeDescription = `at next day's preferred time (${dayAfterPreferredTime.toLocaleString()})`;
            }
        } else {
            // No specific cooldown, schedule for next preferred hour (9 AM)
            const now = new Date();
            const nextPreferredTime = new Date();
            
            // Set to next 9 AM
            nextPreferredTime.setHours(BUMP_CONFIG.DISCADIA.bumpHour, 0, 0, 0);
            
            // If it's already past 9 AM today, schedule for tomorrow
            if (now >= nextPreferredTime) {
                nextPreferredTime.setDate(nextPreferredTime.getDate() + 1);
            }
            
            nextAttemptTime = nextPreferredTime.getTime() - now.getTime();
            scheduledTimeDescription = `at preferred time (${nextPreferredTime.toLocaleString()})`;
        }
        
        // Schedule the next attempt
        console.log(`Scheduling next Discadia bump for channel ${channelId} in ${Math.floor(nextAttemptTime / (60 * 60 * 1000))} hours and ${Math.floor((nextAttemptTime % (60 * 60 * 1000)) / (60 * 1000))} minutes ${scheduledTimeDescription}`);
        
        BUMP_CONFIG.DISCADIA.nextScheduledAttempt = BUMP_CONFIG.DISCADIA.nextScheduledAttempt || {};
        BUMP_CONFIG.DISCADIA.nextScheduledAttempt[channelId] = setTimeout(async () => {
            console.log(`Executing scheduled Discadia bump for channel ${channelId}`);
            const success = await bumpBot(channelId, 'DISCADIA', BUMP_CONFIG.DISCADIA);
            
            // Schedule the next attempt regardless of success
            // If it failed, the message handler will update the cooldown
            scheduleNextDiscadiaBump(channelId);
        }, nextAttemptTime);
    }

    // Function to loop the regular bumping process
    function loopRegularBumps() {
        const checkInterval = calculateNextCheckTime();
        const minutes = Math.floor(checkInterval / 60000);
        
        console.log(`Next regular bump check in ${minutes} minutes`);
        
        setTimeout(async () => {
            // Only bump Disboard or other regular interval services
            for (const [serviceName, config] of Object.entries(BUMP_CONFIG)) {
                if (serviceName !== 'DISCADIA') {
                    for (const channelId of config.channels) {
                        await bumpBot(channelId, serviceName, config);
                        // Add a small delay between bumps
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
            
            loopRegularBumps();
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
    console.log(`- Discadia: ${BUMP_CONFIG.DISCADIA.channels.length} channel(s): ${BUMP_CONFIG.DISCADIA.channels.join(', ')} (prioritizes bumping at ${formatHour(BUMP_CONFIG.DISCADIA.bumpHour)})`);

    // Initialize Discadia with targeted scheduling
    for (const channelId of BUMP_CONFIG.DISCADIA.channels) {
        scheduleNextDiscadiaBump(channelId);
    }
    
    // Start the regular bumping process for other services
    await bumpAllServices();
    loopRegularBumps();
});

client.login(process.env.TOKEN);