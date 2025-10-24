/**
 * Popup script for LekkerChat extension
 */

/**
 * Debounce function to limit how often a function can be called
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Browser API abstraction - Fixed version
const browserAPI = (() => {
    // Check if we're in Chrome or Firefox
    const isChrome = typeof chrome !== 'undefined' && chrome.storage;
    const isFirefox = typeof browser !== 'undefined' && browser.storage;

    if (isChrome) {
        return {
            storage: {
                local: {
                    get: (keys) => new Promise((resolve, reject) => {
                        chrome.storage.local.get(keys, (result) => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve(result);
                            }
                        });
                    }),
                    set: (items) => new Promise((resolve, reject) => {
                        chrome.storage.local.set(items, () => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve();
                            }
                        });
                    })
                }
            },
            tabs: {
                query: (queryInfo) => new Promise((resolve, reject) => {
                    chrome.tabs.query(queryInfo, (tabs) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(tabs);
                        }
                    });
                }),
                sendMessage: (tabId, message) => new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tabId, message, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    });
                }),
                create: (createProperties) => chrome.tabs.create(createProperties)
            }
        };
    } else if (isFirefox) {
        return {
            storage: browser.storage,
            tabs: browser.tabs
        };
    } else {
        // Fallback for testing
        console.warn('No browser API detected, using fallback');
        return {
            storage: {
                local: {
                    get: async () => ({}),
                    set: async () => ({})
                }
            },
            tabs: {
                query: async () => [],
                sendMessage: async () => ({}),
                create: () => { }
            }
        };
    }
})();

// Default settings
const DEFAULT_SETTINGS = {
    timeOffset: 900, // 15 minutes default
    enableSync: true,
    autoScroll: true,
    environment: 'production'
};

// Time conversion utilities
function secondsToMMSS(seconds) {
    const isNegative = seconds < 0;
    const absSeconds = Math.abs(seconds);
    const minutes = Math.floor(absSeconds / 60);
    const secs = absSeconds % 60;
    return `${isNegative ? '-' : ''}${minutes}:${secs.toString().padStart(2, '0')}`;
}

function mmssToSeconds(mmss) {
    const isNegative = mmss.startsWith('-');
    const cleanMmss = mmss.replace('-', '');
    const [minutes, seconds] = cleanMmss.split(':').map(Number);
    const totalSeconds = minutes * 60 + seconds;
    return isNegative ? -totalSeconds : totalSeconds;
}

// DOM elements
let elements = {};

/**
 * Initialize the popup
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Popup initializing...');
    console.log('Chrome available:', typeof chrome !== 'undefined');
    console.log('Browser available:', typeof browser !== 'undefined');
    console.log('Chrome storage:', typeof chrome !== 'undefined' ? !!chrome.storage : 'N/A');
    console.log('Browser storage:', typeof browser !== 'undefined' ? !!browser.storage : 'N/A');

    initializeElements();
    console.log('Elements initialized');

    await loadSettings();
    console.log('Settings loaded');

    setupEventListeners();
    console.log('Event listeners setup');

    await updateStatus();
    console.log('Status updated');

    console.log('Popup initialization complete');
});

/**
 * Get DOM element references
 */
function initializeElements() {
    elements = {
        statusIndicator: document.getElementById('statusIndicator'),
        statusText: document.getElementById('statusText'),
        timeOffset: document.getElementById('timeOffset'),
        setCurrentTime: document.getElementById('setCurrentTime'),
        reportIssue: document.getElementById('reportIssue')
    };
}

/**
 * Load settings from storage
 */
async function loadSettings() {
    try {
        const result = await browserAPI.storage.local.get(DEFAULT_SETTINGS);

        elements.timeOffset.value = secondsToMMSS(result.timeOffset);

        console.log('Settings loaded:', result);
    } catch (error) {
        console.error('Failed to load settings:', error);
        showMessage('Kan instellingen niet laden', 'error');
    }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
    try {
        // Validate and convert mm:ss to seconds
        let timeOffsetSeconds;
        try {
            timeOffsetSeconds = mmssToSeconds(elements.timeOffset.value);
        } catch (error) {
            showMessage('Ongeldige tijd format (gebruik mm:ss)', 'error');
            return;
        }

        const settings = {
            timeOffset: timeOffsetSeconds,
            enableSync: true,
            autoScroll: true,
            environment: 'production'
        };

        await browserAPI.storage.local.set(settings);

        // Send message to content script to update settings
        try {
            const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                await browserAPI.tabs.sendMessage(tabs[0].id, {
                    action: 'updateSettings',
                    settings: settings
                });
            }
        } catch (error) {
            console.log('Content script not available (normal if not on YouTube)');
        }

        showMessage('Instellingen opgeslagen!', 'success');
        console.log('Settings saved:', settings);
    } catch (error) {
        console.error('Failed to save settings:', error);
        showMessage('Kan instellingen niet opslaan', 'error');
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Set current time button
    elements.setCurrentTime.addEventListener('click', setCurrentVideoTime);

    // Report issue button
    elements.reportIssue.addEventListener('click', reportIssue);

    // Auto-save on input changes
    elements.timeOffset.addEventListener('change', saveSettings);
    elements.timeOffset.addEventListener('input', debounce(saveSettings, 500)); // Debounced for live updates
}

/**
 * Set offset to current video time
 */
async function setCurrentVideoTime() {
    try {
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
            const response = await browserAPI.tabs.sendMessage(tabs[0].id, {
                action: 'getCurrentTime'
            });

            if (response && response.currentTime !== undefined) {
                const currentTimeSeconds = Math.floor(response.currentTime);
                elements.timeOffset.value = secondsToMMSS(currentTimeSeconds);
                await saveSettings();
                showMessage('Tijd ingesteld op huidige positie', 'success');
            } else {
                showMessage('Kan huidige tijd niet ophalen', 'error');
            }
        }
    } catch (error) {
        console.error('Failed to get current time:', error);
        showMessage('Kan huidige tijd niet ophalen', 'error');
    }
}

/**
 * Update extension status
 */
async function updateStatus() {
    try {
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];

        if (!currentTab) {
            setStatus('Geen actief tabblad', 'error');
            return;
        }

        const isYouTube = currentTab.url && currentTab.url.includes('youtube.com/watch');

        if (!isYouTube) {
            setStatus('Niet op YouTube', 'inactive');
            return;
        }

        // Check if it's a Lekker Spelen video
        try {
            const response = await browserAPI.tabs.sendMessage(currentTab.id, {
                action: 'checkLekkerSpelen'
            });

            if (response && !response.isLekkerSpelen) {
                setStatus('Niet op een Lekker Spelen video', 'inactive');
                return;
            }
        } catch (error) {
            console.log('Could not check if Lekker Spelen video');
        }

        // Try to get status from content script
        try {
            const response = await browserAPI.tabs.sendMessage(currentTab.id, {
                action: 'getStatus'
            });

            if (response && response.status) {
                setStatus(response.message || 'Actief', 'active');
            } else {
                setStatus('Chat niet gesynchroniseerd', 'inactive');
            }
        } catch (error) {
            setStatus('Extensie laden...', 'loading');
        }

    } catch (error) {
        console.error('Failed to update status:', error);
        setStatus('Status onbekend', 'error');
    }
}

/**
 * Set status indicator
 */
function setStatus(message, type) {
    elements.statusText.textContent = message;
    const dot = elements.statusIndicator.querySelector('.status-dot');

    dot.className = 'status-dot';
    if (type === 'active') {
        dot.classList.add('active');
    } else if (type === 'error') {
        dot.classList.add('error');
    }
}

/**
 * Report an issue
 */
function reportIssue() {
    const issueUrl = 'https://github.com/hbo-nerds/lekker-chat/issues/new';
    browserAPI.tabs.create({ url: issueUrl });
}

/**
 * Show temporary message
 */
function showMessage(message, type) {
    // Create or update message element
    let messageEl = document.querySelector('.popup-message');
    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.className = 'popup-message';
        document.querySelector('.popup-container').appendChild(messageEl);
    }

    messageEl.textContent = message;
    messageEl.className = `popup-message ${type}`;
    messageEl.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        right: 10px;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
        text-align: center;
        ${type === 'success' ? 'background: #00ff88; color: #000;' : ''}
        ${type === 'error' ? 'background: #ff4444; color: #fff;' : ''}
    `;

    setTimeout(() => {
        if (messageEl && messageEl.parentNode) {
            messageEl.parentNode.removeChild(messageEl);
        }
    }, 3000);
}

// Update status periodically
setInterval(updateStatus, 2000);