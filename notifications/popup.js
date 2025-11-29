document.addEventListener('DOMContentLoaded', () => {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const reminderTimeInput = document.getElementById('reminderTime');
    const saveTimeBtn = document.getElementById('saveTimeBtn');
    const eventsInfo = document.getElementById('eventsInfo');

    let connectionTimeout;

    function setStatus(connected, message = '') {
        // Clear any existing timeout
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
        
        statusIndicator.className = 'status-indicator';
        
        if (connected === 'checking') {
            statusIndicator.classList.add('status-checking');
            statusText.textContent = message || 'Checking calendar status...';
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.add('hidden');
        } else if (connected) {
            statusIndicator.classList.add('status-connected');
            statusText.textContent = message || 'Connected to Google Calendar ✅';
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
            eventsInfo.textContent = 'Daily events are active in your Google Calendar with 10-minute reminders.';
        } else {
            statusIndicator.classList.add('status-disconnected');
            statusText.textContent = message || 'Disconnected from Google Calendar ❌';
            connectBtn.classList.remove('hidden');
            disconnectBtn.classList.add('hidden');
            eventsInfo.textContent = 'Connect to Google Calendar to create daily reminder events.';
        }
    }

    function setLoading(loading, button = null) {
        if (loading) {
            document.body.classList.add('loading');
            if (button) {
                button.disabled = true;
            }
            
            // Set timeout to prevent infinite loading
            connectionTimeout = setTimeout(() => {
                setLoading(false, button);
                setStatus(false, 'Connection timeout - check console for errors');
                eventsInfo.textContent = 'Took too long to connect. Check if Google Calendar API is enabled.';
                eventsInfo.style.color = 'var(--color-error)';
            }, 10000); // 10 second timeout
        } else {
            document.body.classList.remove('loading');
            if (button) {
                button.disabled = false;
                if (button === connectBtn) connectBtn.textContent = 'Connect Google Calendar';
                if (button === disconnectBtn) disconnectBtn.textContent = 'Disconnect';
                if (button === saveTimeBtn) saveTimeBtn.textContent = 'Save';
            }
            
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
        }
    }

    // Query current status from background
    function loadStatus() {
        setStatus('checking', 'Checking calendar connection...');
        
        chrome.runtime.sendMessage({ type: 'GET_NOTIFICATION_STATUS' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting status:', chrome.runtime.lastError);
                setStatus(false, 'Error: ' + chrome.runtime.lastError.message);
                return;
            }

            if (!response) {
                setStatus(false, 'No response from extension');
                return;
            }

            if (response.calendarConnected) {
                setStatus(true, 'Connected to Google Calendar ✅');
            } else {
                setStatus(false, 'Disconnected from Google Calendar ❌');
            }

            if (response.preferences && response.preferences.reminderTime) {
                reminderTimeInput.value = response.preferences.reminderTime;
            }
        });
    }

    connectBtn.addEventListener('click', async () => {
        setLoading(true, connectBtn);
        connectBtn.textContent = 'Connecting...';
        
        console.log('🔄 Starting Google Calendar connection from popup...');
        
        chrome.runtime.sendMessage({ type: 'CONNECT_GOOGLE_CALENDAR' }, (response) => {
            console.log('📨 Received response:', response);
            setLoading(false, connectBtn);
            
            if (response && response.success) {
                setStatus(true, 'Connected to Google Calendar ✅');
                eventsInfo.textContent = 'Success! Daily events will be created in your calendar.';
                eventsInfo.style.color = 'var(--color-success)';
            } else {
                const errorMsg = getErrorMessage(response);
                setStatus(false, 'Failed to connect ❌');
                eventsInfo.innerHTML = `Connection failed:<br><strong>${errorMsg}</strong>`;
                eventsInfo.style.color = 'var(--color-error)';
                
                // Reset error message after 8 seconds
                setTimeout(() => {
                    eventsInfo.textContent = 'Connect to Google Calendar to create daily reminder events.';
                    eventsInfo.style.color = '';
                }, 8000);
            }
        });
    });

    function getErrorMessage(response) {
        if (!response) return 'No response from extension - check console';
        if (response.error) return response.error;
        if (response.success === false) return 'Authentication failed';
        
        // Common OAuth errors
        if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError.message;
            if (error.includes('OAuth2')) return 'OAuth configuration error';
            if (error.includes('client_id')) return 'Invalid Client ID - check Google Cloud Console';
            if (error.includes('redirect')) return 'Redirect URI mismatch';
            if (error.includes('access_denied')) return 'Permission denied by user';
            return error;
        }
        
        return 'Unknown error - check Developer Tools (F12) Console';
    }

    disconnectBtn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to disconnect? This will remove all Mango Diaries reminder events from your calendar.')) {
            return;
        }
        
        setLoading(true, disconnectBtn);
        disconnectBtn.textContent = 'Disconnecting...';
        
        chrome.runtime.sendMessage({ type: 'DISCONNECT_GOOGLE_CALENDAR' }, (response) => {
            setLoading(false, disconnectBtn);
            
            if (response && response.success) {
                setStatus(false, 'Disconnected from Google Calendar ❌');
                eventsInfo.textContent = 'All reminder events have been removed.';
                eventsInfo.style.color = 'var(--color-success)';
            } else {
                setStatus(true, 'Error disconnecting');
                eventsInfo.textContent = 'Failed to disconnect. Check console for errors.';
                eventsInfo.style.color = 'var(--color-error)';
            }
        });
    });

    saveTimeBtn.addEventListener('click', () => {
        const time = reminderTimeInput.value;
        if (!time) {
            alert('Please choose a time for your daily reminder.');
            return;
        }
        
        setLoading(true, saveTimeBtn);
        saveTimeBtn.textContent = 'Saving...';
        
        chrome.runtime.sendMessage({ 
            type: 'UPDATE_NOTIFICATION_PREFERENCES', 
            preferences: { reminderTime: time } 
        }, (response) => {
            setLoading(false, saveTimeBtn);
            
            if (response && response.success) {
                eventsInfo.textContent = `Reminder time saved! Events will update to ${time}.`;
                eventsInfo.style.color = 'var(--color-success)';
                
                setTimeout(() => {
                    eventsInfo.textContent = 'Daily events are active in your Google Calendar with 10-minute reminders.';
                    eventsInfo.style.color = '';
                }, 3000);
            } else {
                eventsInfo.textContent = 'Failed to save time. Please try again.';
                eventsInfo.style.color = 'var(--color-error)';
            }
        });
    });

    // Load initial status
    loadStatus();
});