
const calendarService = {
    initialized: false,
    token: null,

    async initialize() {
        console.log('🔄 Initializing calendar service...');
        try {
            console.log('🔐 Attempting silent authentication...');
            this.token = await this.getToken({ interactive: false });
            this.initialized = true;
            console.log('✅ Calendar service initialized silently');
            
            // Test the connection
            await this.testConnection();
            
        } catch (err) {
            console.log('ℹ️ Calendar service needs user authentication:', err.message);
            this.token = null;
            this.initialized = false;
        }
        return this.initialized;
    },

    async authenticate() {
        console.log('🔐 Starting authentication...');
        try {
            console.log('📝 Requesting OAuth token with interactive flow...');
            this.token = await this.getToken({ interactive: true });
            this.initialized = !!this.token;
            
            if (this.initialized) {
                console.log('✅ Authentication successful, token received');
                console.log('🧪 Testing API access...');
                
                // Test the token by making a simple API call
                const testResult = await this.testConnection();
                
                if (testResult) {
                    console.log('🎉 Calendar service fully authenticated and working!');
                } else {
                    console.warn('⚠️ Authentication successful but API test failed');
                }
            } else {
                console.error('❌ Authentication failed - no token received');
            }
            
            return this.initialized;
        } catch (error) {
            console.error('💥 Authentication error:', error);
            this.initialized = false;
            throw error;
        }
    },

    async testConnection() {
        if (!this.token) {
            console.log('❌ No token available for connection test');
            return false;
        }
        
        try {
            console.log('🧪 Testing calendar API access...');
            const testUrl = 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1';
            const testResponse = await this.fetchWithAuth(testUrl);
            
            if (testResponse.ok) {
                console.log('✅ Calendar API test successful - access confirmed');
                return true;
            } else {
                console.warn(`⚠️ Calendar API test failed with status: ${testResponse.status}`);
                return false;
            }
        } catch (error) {
            console.error('💥 Connection test failed:', error);
            return false;
        }
    },

    async getToken({ interactive } = { interactive: false }) {
        console.log(`🔐 getToken called with interactive: ${interactive}`);
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive }, (token) => {
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message;
                    console.error('❌ getAuthToken failed:', errorMsg);
                    reject(new Error(errorMsg));
                    return;
                }
                
                if (!token) {
                    console.error('❌ getAuthToken returned no token');
                    reject(new Error('No token received from Chrome identity API'));
                    return;
                }
                
                console.log('✅ Token obtained successfully');
                resolve(token);
            });
        });
    },

    async removeCachedToken(token) {
        console.log('🗑️ Removing cached token...');
        return new Promise((resolve) => {
            chrome.identity.removeCachedAuthToken({ token }, () => {
                resolve();
            });
        });
    },

    async fetchWithAuth(url, opts = {}) {
        console.log(`🌐 Making authenticated request to: ${url}`);
        
        if (!this.token) {
            console.error('❌ No authentication token available');
            throw new Error('No authentication token available');
        }

        const headers = new Headers(opts.headers || {});
        headers.set('Authorization', 'Bearer ' + this.token);
        headers.set('Accept', 'application/json');
        headers.set('Content-Type', 'application/json');

        try {
            const response = await fetch(url, { ...opts, headers });
            console.log(`📨 Response status: ${response.status} ${response.statusText}`);

            if (response.status === 401) {
                console.log('🔄 Token expired, refreshing...');
                await this.removeCachedToken(this.token);
                this.token = await this.getToken({ interactive: true });
                headers.set('Authorization', 'Bearer ' + this.token);
                console.log('🔁 Retrying request with new token...');
                return fetch(url, { ...opts, headers });
            }

            return response;
        } catch (error) {
            console.error('💥 Network request failed:', error);
            throw error;
        }
    },

    async createDailyReminderEvent(timeString) {
        console.log(`📅 Creating daily reminder event for time: ${timeString}`);
        
        if (!this.initialized) {
            throw new Error('calendarService not initialized or authenticated');
        }

        const [hours, minutes] = timeString.split(':').map((s) => parseInt(s, 10));

        // Compute next occurrence
        const now = new Date();
        const start = new Date(now);
        start.setHours(hours, minutes, 0, 0);
        if (start <= now) {
            console.log('⏩ Event time passed today, scheduling for tomorrow');
            start.setDate(start.getDate() + 1);
        }

        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

        const event = {
            summary: '📖 Mango Diaries - Time to Journal',
            description: 'mango-diaries:daily-reminder\nTime to write your daily journal entry! Reflect on your day and capture your thoughts.',
            start: { dateTime: start.toISOString(), timeZone },
            end: { dateTime: end.toISOString(), timeZone },
            recurrence: ['RRULE:FREQ=DAILY'],
            reminders: { 
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 10 }
                ]
            }
        };

        const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
        const response = await this.fetchWithAuth(url, {
            method: 'POST',
            body: JSON.stringify(event)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to create calendar event: ${response.status} ${text}`);
        }

        const created = await response.json();
        console.log('✅ Calendar event created successfully');
        return created;
    },

    async listReminderEvents() {
        console.log('📋 Listing existing reminder events...');
        if (!this.initialized) {
            console.log('ℹ️ Calendar not initialized, returning empty list');
            return [];
        }
        
        const params = new URLSearchParams({
            q: 'mango-diaries:daily-reminder',
            maxResults: '50'
        });
        
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;
        const res = await this.fetchWithAuth(url);
        
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to list events: ${res.status} ${text}`);
        }
        
        const data = await res.json();
        return data.items || [];
    },

    async removeAllReminderEvents() {
        console.log('🗑️ Removing all existing reminder events...');
        if (!this.initialized) {
            console.log('ℹ️ Calendar not initialized, skipping event removal');
            return;
        }
        
        try {
            const events = await this.listReminderEvents();
            console.log(`🗑️ Found ${events.length} events to remove`);
            
            for (const ev of events) {
                try {
                    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(ev.id)}`;
                    await this.fetchWithAuth(url, { method: 'DELETE' });
                } catch (err) {
                    console.warn(`⚠️ Error deleting event ${ev.id}:`, err.message);
                }
            }
        } catch (error) {
            console.error('❌ Error removing reminder events:', error);
        }
    },

    async disconnect() {
        console.log('🔌 Disconnecting calendar service...');
        
        if (!this.token) {
            this.initialized = false;
            return;
        }

        try {
            await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${this.token}`);
        } catch (e) {
            // Ignore revocation errors
        }

        try {
            await this.removeCachedToken(this.token);
        } catch (e) {
            // Ignore cache removal errors
        }

        this.token = null;
        this.initialized = false;
    }
};

// Background service worker for notifications with Google Calendar integration
class NotificationManager {
    constructor() {
        this.initialized = false;
        this.userPreferences = {
            dailyReminder: true,
            reminderTime: "20:00",
            weeklySummary: false,
            achievementAlerts: true,
            googleCalendarConnected: false
        };
        this.calendarEventId = null;
        this.init();
    }

    async init() {
        console.log('🔔 Notification Manager Initializing...');
        
        await this.loadPreferences();
        
        // Initialize calendar service (non-interactive)
        if (typeof calendarService !== 'undefined') {
            try {
                await calendarService.initialize();
                this.userPreferences.googleCalendarConnected = calendarService.initialized;
                console.log('✅ Calendar service initialized:', calendarService.initialized);
            } catch (error) {
                console.error('❌ Calendar service init failed:', error);
                this.userPreferences.googleCalendarConnected = false;
            }
        } else {
            console.error('❌ calendarService not found! Check file loading order.');
            this.userPreferences.googleCalendarConnected = false;
        }
        
        this.setupDailyReminder();
        
        this.initialized = true;
        console.log('🔔 Notification Manager Ready');
    }

    async loadPreferences() {
        try {
            const saved = await chrome.storage.local.get(['notificationPreferences']);
            if (saved.notificationPreferences) {
                this.userPreferences = { ...this.userPreferences, ...saved.notificationPreferences };
            }
        } catch (error) {
            console.error('Error loading preferences:', error);
        }
    }

    async savePreferences() {
        try {
            await chrome.storage.local.set({ 
                notificationPreferences: this.userPreferences 
            });
        } catch (error) {
            console.error('Error saving preferences:', error);
        }
    }

    setupDailyReminder() {
        if (!this.userPreferences.dailyReminder) return;

        try {
            const [hours, minutes] = this.userPreferences.reminderTime.split(':').map(s => parseInt(s, 10));
            const next = new Date();
            next.setHours(hours, minutes, 0, 0);
            if (next <= new Date()) next.setDate(next.getDate() + 1);
            const when = next.getTime();

            console.log(`⏰ Scheduling alarm for: ${new Date(when)}`);

            // Clear existing alarm first to avoid duplicates
            chrome.alarms.clear('daily-reminder', () => {
                chrome.alarms.create('daily-reminder', { when });
            });

            // Setup Google Calendar event if connected
            this.setupCalendarReminder();
        } catch (error) {
            console.error('Error setting up daily reminder:', error);
        }
    }

    async connectGoogleCalendar() {
        console.log('🔄 Starting Google Calendar connection...');
        try {
            if (typeof calendarService === 'undefined') {
                throw new Error('Calendar service not available - check file loading');
            }

            console.log('🔐 Authenticating with Google...');
            const success = await calendarService.authenticate();
            
            if (success) {
                console.log('✅ Authentication successful');
                this.userPreferences.googleCalendarConnected = true;
                await this.savePreferences();
                
                console.log('📅 Setting up calendar reminder...');
                await this.setupCalendarReminder();
                
                console.log('🎉 Google Calendar connection complete!');
                return { success: true };
            } else {
                console.error('❌ Authentication failed - no success flag');
                return { success: false, error: 'Authentication failed - check Google Cloud Console setup' };
            }
        } catch (error) {
            console.error('💥 Google Calendar connection failed:', error);
            
            let userError = 'Connection failed: ';
            if (error.message.includes('OAuth2')) {
                userError += 'OAuth configuration error. Check Client ID and extension ID match.';
            } else if (error.message.includes('client_id')) {
                userError += 'Invalid Client ID. Update manifest.json with correct Client ID from Google Cloud Console.';
            } else if (error.message.includes('The user did not consent')) {
                userError += 'Permission denied. Please allow calendar access.';
            } else {
                userError += error.message;
            }
            
            return { success: false, error: userError };
        }
    }

    async disconnectGoogleCalendar() {
        try {
            if (typeof calendarService !== 'undefined') {
                await calendarService.removeAllReminderEvents();
                await calendarService.disconnect();
            }
            this.userPreferences.googleCalendarConnected = false;
            await this.savePreferences();
            return { success: true };
        } catch (error) {
            console.error('Google Calendar disconnection failed:', error);
            return { success: false, error: error.message };
        }
    }

    handleAlarm(alarm) {
        if (!alarm || !alarm.name) return;
        if (alarm.name === 'daily-reminder') {
            this.sendDailyReminder();
            // Reschedule for next day
            try {
                const [hours, minutes] = this.userPreferences.reminderTime.split(':').map(s => parseInt(s, 10));
                const next = new Date();
                next.setHours(hours, minutes, 0, 0);
                next.setDate(next.getDate() + 1);
                chrome.alarms.create('daily-reminder', { when: next.getTime() });
            } catch (error) {
                console.error('Error rescheduling alarm:', error);
            }
        }
    }

    async setupCalendarReminder() {
        if (this.userPreferences.googleCalendarConnected && 
            typeof calendarService !== 'undefined' && 
            calendarService.initialized) {
            try {
                // Remove any existing events first
                await this.withRetry(() => calendarService.removeAllReminderEvents());
                
                // Create new daily event
                const event = await this.withRetry(() => 
                    calendarService.createDailyReminderEvent(this.userPreferences.reminderTime)
                );
                this.calendarEventId = event.id;
                
                console.log('✅ Google Calendar reminder setup complete');
            } catch (error) {
                console.error('❌ Failed to setup calendar reminder:', error);
                this.userPreferences.googleCalendarConnected = false;
                await this.savePreferences();
            }
        }
    }

    async withRetry(operation, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                console.warn(`Attempt ${attempt} failed:`, error);
                if (attempt === maxRetries) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    sendDailyReminder() {
        try {
            chrome.notifications.create('daily-reminder', {
                type: 'basic',
                iconUrl: 'icons/icon-128.png',
                title: '📖 Mango Diaries Reminder',
                message: 'Time to write your daily journal entry! Reflect on your day and capture your thoughts.',
                buttons: [
                    { title: 'Write Now' },
                    { title: 'Snooze 1 Hour' }
                ],
                priority: 2
            });
        } catch (error) {
            console.error('Error sending notification:', error);
        }
    }

    handleNotificationClick(notificationId, buttonIndex) {
        try {
            switch(notificationId) {
                case 'daily-reminder':
                    if (buttonIndex === 0) {
                        chrome.tabs.create({ url: chrome.runtime.getURL('journal/new-entry.html') });
                    } else if (buttonIndex === 1) {
                        setTimeout(() => this.sendDailyReminder(), 60 * 60 * 1000);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling notification click:', error);
        }
    }

    async updatePreferences(newPreferences) {
        this.userPreferences = { ...this.userPreferences, ...newPreferences };
        await this.savePreferences();
        
        // Restart reminder with new settings
        this.setupDailyReminder();
    }
}

// Initialize when service worker starts
let notificationManager;

try {
    notificationManager = new NotificationManager();
} catch (error) {
    console.error('Failed to initialize NotificationManager:', error);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Received message:', request.type);
    
    if (!notificationManager) {
        sendResponse({ success: false, error: 'Notification manager not initialized' });
        return;
    }

    switch (request.type) {
        case 'UPDATE_NOTIFICATION_PREFERENCES':
            notificationManager.updatePreferences(request.preferences);
            sendResponse({ success: true });
            break;
            
        case 'CONNECT_GOOGLE_CALENDAR':
            notificationManager.connectGoogleCalendar().then(response => {
                sendResponse(response);
            });
            return true;
            
        case 'DISCONNECT_GOOGLE_CALENDAR':
            notificationManager.disconnectGoogleCalendar().then(response => {
                sendResponse(response);
            });
            return true;
            
        case 'GET_NOTIFICATION_STATUS':
            sendResponse({
                preferences: notificationManager.userPreferences,
                calendarConnected: typeof calendarService !== 'undefined' && 
                                 calendarService.initialized && 
                                 notificationManager.userPreferences.googleCalendarConnected
            });
            break;
            
        default:
            sendResponse({ success: false, error: 'Unknown message type: ' + request.type });
    }
});

// Listen for notification clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationManager) {
        notificationManager.handleNotificationClick(notificationId, buttonIndex);
    }
});

chrome.notifications.onClicked.addListener((notificationId) => {
    try {
        chrome.tabs.create({ url: chrome.runtime.getURL('journal/new-entry.html') });
    } catch (error) {
        console.error('Error opening journal:', error);
    }
});

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    if (notificationManager) {
        try {
            notificationManager.handleAlarm(alarm);
        } catch (err) {
            console.error('Error handling alarm', err);
        }
    }
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('🔔 Mango Diaries Notifications installed');
});