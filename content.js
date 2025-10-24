/**
 * Twitch Chat Sync Extension
 * Synchronizes Twitch chat data with YouTube videos
 */

// Configuration constants
const CONSTANTS = {
    TWITCH_EMOTE_URL: 'https://static-cdn.jtvnw.net/emoticons/v1/{id}/1.0',
    TWITCH_BADGE_URL: 'https://static-cdn.jtvnw.net/badges/v1/{id}/1',
    UPDATE_INTERVAL: 100,
    URL_CHECK_INTERVAL: 1000,
    CHAT_CHECK_INTERVAL: 1000,
    VIDEO_CHECK_INTERVAL: 500,
    SKIP_THRESHOLD: 15,
    PREVIOUS_MESSAGES_COUNT: 25
};

// Global state
let chatData = null;
let imageData = null;
let ttvLink = null;
let videoInterval = null;
let chatInterval = null;
let messageList = null;
let shownMessages = new Set();
let config = null;
let video = null;
let lastSecond = -1;
let isActive = false;

/**
 * Browser API abstraction for cross-browser compatibility
 */
const browserAPI = {
    getURL: (path) => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            return chrome.runtime.getURL(path);
        } else if (typeof browser !== 'undefined' && browser.runtime) {
            return browser.runtime.getURL(path);
        }
        throw new Error('Browser extension API not available');
    },
    storage: {
        local: {
            get: (keys) => {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
                } else if (typeof browser !== 'undefined' && browser.storage) {
                    return browser.storage.local.get(keys);
                }
                throw new Error('Storage API not available');
            },
            set: (items) => {
                if (typeof chrome !== 'undefined' && chrome.storage) {
                    return new Promise(resolve => chrome.storage.local.set(items, resolve));
                } else if (typeof browser !== 'undefined' && browser.storage) {
                    return browser.storage.local.set(items);
                }
                throw new Error('Storage API not available');
            }
        }
    }
};

/**
 * Replace text emotes with HTML image elements
 * @param {string} content - The message content
 * @returns {string} HTML string with emotes replaced
 */
function replaceEmotes(content) {
    if (!imageData?.emoticons) return content;

    try {
        return content.split(/\s+/).map(word => {
            const emoteId = imageData.emoticons[word];
            if (emoteId) {
                const emoteUrl = CONSTANTS.TWITCH_EMOTE_URL.replace('{id}', emoteId);
                const emoteImg = `<img src="${emoteUrl}" alt="${word}" class="chat-image chat-line__message--emote">`;
                return `<div class='chat-emote'><span><div class='chat-image__container'>${emoteImg}</div></span></div>`;
            } else {
                return `<span class="text-fragment" data-a-target="chat-message-text">${word}</span>`;
            }
        }).join(' ');
    } catch (error) {
        console.error('Error replacing emotes:', error);
        return content;
    }
}

/**
 * Create a chat message DOM element
 * @param {Object} msg - Message data from chat JSON
 * @returns {HTMLElement} List item containing the formatted message
 */
function createChatMessage(msg) {
    if (!msg || !chatData?.commenters?.[msg.commenter]) {
        console.warn('Invalid message data:', msg);
        return document.createElement("li");
    }

    const li = document.createElement("li");

    const vodMessage = li.appendChild(document.createElement("div"));
    vodMessage.className = "vod-message";

    const vodMessageDiv1 = vodMessage.appendChild(document.createElement("div"));
    const vodMessageDiv2 = vodMessageDiv1.appendChild(document.createElement("div"));
    vodMessageDiv2.className = "message-box";
    const vodMessageDiv3 = vodMessageDiv2.appendChild(document.createElement("div"));
    vodMessageDiv3.className = "message-box-inner";

    const author = chatData.commenters[msg.commenter];

    const badgesSpan = vodMessageDiv3.appendChild(document.createElement("span"));
    if (author.badges && Array.isArray(author.badges)) {
        author.badges.forEach(badge => {
            if (!imageData?.badges?.[badge._id]) {
                return;
            }

            const badgeDiv = badgesSpan.appendChild(document.createElement("div"));
            badgeDiv.className = "badge-box";

            const badgeA = badgeDiv.appendChild(document.createElement("a"));
            const badgeImg = badgeA.appendChild(document.createElement("img"));
            const badgeId = imageData.badges[badge._id]?.[parseInt(badge.version)];
            if (!badgeId) {
                console.warn(`Badge version ${badge.version} not found for badge ID ${badge._id}`);
                return;
            }
            const badgeUrl = CONSTANTS.TWITCH_BADGE_URL.replace('{id}', badgeId);
            badgeImg.setAttribute("src", badgeUrl);
            badgeImg.className = "chat-badge";
        });
    }

    const authorA = vodMessageDiv3.appendChild(document.createElement("a"));
    authorA.setAttribute("href", "https://twitch.tv/" + author.name);
    authorA.className = "chat-author-link";

    const authorSpan = authorA.appendChild(document.createElement("span"));
    authorSpan.innerHTML = `<span class='chat-author__display-name' style='color: ${author.color ?? "#fff"};'>${author.display_name}</span>`;

    const messageDiv = vodMessageDiv3.appendChild(document.createElement("div"));
    messageDiv.className = "video-chat__message";
    const colonSpan = messageDiv.appendChild(document.createElement("span"))
    colonSpan.textContent = ":";
    colonSpan.className = "colon";

    const messageSpan = messageDiv.appendChild(document.createElement("span"));
    messageSpan.innerHTML = replaceEmotes(msg.message);

    return li;
}

// Variables already declared at top of file

/**
 * Display a chat message and handle auto-scrolling
 * @param {Object} comment - Comment data to display
 */
function showMessage(comment) {
    if (!comment || !messageList) {
        console.warn('Cannot show message - invalid comment or messageList not available');
        return;
    }

    const isAtBottom = messageList.scrollTop == null ? false :
        Math.abs(messageList.scrollTop + messageList.clientHeight - messageList.scrollHeight) < 5;

    shownMessages.add(comment);
    const messageElement = createChatMessage(comment);
    messageList.appendChild(messageElement);

    if (isAtBottom) {
        messageList.scrollTop = messageList.scrollHeight;
    }
}

/**
 * Inject the Twitch chat interface into the YouTube chat container
 * @param {HTMLElement} chatContainer - The YouTube chat container element
 */
function injectChat(chatContainer) {
    if (!chatContainer) {
        console.error('Cannot inject chat - chat container not found');
        return;
    }

    try {
        chatContainer.innerHTML = "";
        messageList = chatContainer.appendChild(document.createElement("ul"));
        messageList.className = "chat-message-list";

        console.log("Successfully injected Twitch chat interface!");
    } catch (error) {
        console.error('Error injecting chat:', error);
    }
}

/**
 * Wait for the YouTube chat container to be available
 * @returns {Promise<HTMLElement>} Promise that resolves with the chat container
 */
function waitForChatContainer() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds timeout

        const checkExist = setInterval(() => {
            attempts++;
            const chatContainer = document.querySelector("#chat");

            if (chatContainer) {
                clearInterval(checkExist);
                injectChat(chatContainer);
                resolve(chatContainer);
            } else if (attempts >= maxAttempts) {
                clearInterval(checkExist);
                reject(new Error('Chat container not found after 30 seconds'));
            }
        }, CONSTANTS.CHAT_CHECK_INTERVAL);
    });
}

/**
 * Wait for the video element to be available
 * @returns {Promise<HTMLVideoElement>} Promise that resolves with the video element
 */
function getVideoElement() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 60; // 30 seconds timeout

        const checkInterval = setInterval(() => {
            attempts++;
            const videoElement = document.querySelector('video');

            if (videoElement) {
                clearInterval(checkInterval);
                resolve(videoElement);
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                reject(new Error('Video element not found after 30 seconds'));
            }
        }, CONSTANTS.VIDEO_CHECK_INTERVAL);
    });
}

/**
 * Show previous messages when jumping to a specific time
 * @param {number} second - Current video time in seconds
 */
function showPreviousMessages(second) {
    if (!chatData?.comments) {
        console.warn('No chat data available for showing previous messages');
        return;
    }

    try {
        const firstIdx = [...chatData.comments].reverse().findIndex(comment =>
            (comment.content_offset_seconds + getTimeOffset()) < second
        );
        if (firstIdx !== -1) {
            const startIdx = Math.max(0, firstIdx - CONSTANTS.PREVIOUS_MESSAGES_COUNT);
            for (let i = startIdx; i < firstIdx; i++) {
                const comment = chatData.comments[i];
                if (comment && !shownMessages.has(comment)) {
                    showMessage(comment);
                }
            }
        }
    } catch (error) {
        console.error('Error showing previous messages:', error);
    }
}

/**
 * Show messages that were missed during time jumps
 * @param {number} from - Start time in seconds
 * @param {number} to - End time in seconds
 */
function showMissedMessages(from, to) {
    if (!chatData?.comments) {
        console.warn('No chat data available for showing missed messages');
        return;
    }

    try {
        for (let sec = from; sec <= to; sec++) {
            const missedComments = chatData.comments.filter(comment =>
                comment && (comment.content_offset_seconds + getTimeOffset()) === sec && !shownMessages.has(comment)
            );
            missedComments.forEach(comment => showMessage(comment));
        }
    } catch (error) {
        console.error('Error showing missed messages:', error);
    }
}

/**
 * Show messages for the current second with staggered timing
 * @param {number} currentSecond - Current video time in seconds
 */
function showCurrentSecondMessages(currentSecond) {
    if (!chatData?.comments) {
        return;
    }

    try {
        const commentsThisSecond = chatData.comments.filter(comment =>
            comment && (comment.content_offset_seconds + getTimeOffset()) === currentSecond && !shownMessages.has(comment)
        );
        const count = commentsThisSecond.length;

        if (count > 0) {
            commentsThisSecond.forEach((comment, idx) => {
                setTimeout(() => {
                    showMessage(comment);
                }, (idx * 1000) / count);
            });
        }
    } catch (error) {
        console.error('Error showing current second messages:', error);
    }
}

/**
 * Handle video ready state and start synchronization
 */
async function onVideoReady() {
    try {
        video = await getVideoElement();

        if (videoInterval) {
            clearInterval(videoInterval);
            shownMessages.clear();
            if (messageList) {
                messageList.innerHTML = "";
            }
        }

        videoInterval = setInterval(() => {
            if (!video || video.paused) return;

            const currentSecond = Math.floor(video.currentTime);
            if (currentSecond !== lastSecond) {
                // Large time jump - show previous messages for context
                if (Math.abs(currentSecond - lastSecond) > CONSTANTS.SKIP_THRESHOLD) {
                    shownMessages.clear();
                    if (messageList) {
                        messageList.innerHTML = "";
                    }
                    showPreviousMessages(currentSecond);
                }
                // Small time jump - show missed messages
                else if (Math.abs(currentSecond - lastSecond) > 1) {
                    const from = Math.min(lastSecond, currentSecond) + 1;
                    const to = Math.max(lastSecond, currentSecond);
                    showMissedMessages(from, to);
                }

                lastSecond = currentSecond;
                showCurrentSecondMessages(currentSecond);
            }
        }, CONSTANTS.UPDATE_INTERVAL);

        console.log('Video synchronization started');
    } catch (error) {
        console.error('Error setting up video synchronization:', error);
    }
}

/**
 * Initialize configuration system
 */
async function initConfig() {
    try {
        const settings = await browserAPI.storage.local.get({
            timeOffset: 900,
            enableSync: true,
            autoScroll: true,
            environment: 'local'
        });

        config = settings;
        console.log('Configuration loaded:', config);
    } catch (error) {
        console.error('Failed to load configuration:', error);
        config = {
            timeOffset: 900,
            enableSync: true,
            autoScroll: true,
            environment: 'local'
        };
    }
}

/**
 * Get current time offset
 */
function getTimeOffset() {
    return config?.timeOffset || 362;
}

/**
 * Get chat data URL based on environment
 */
function getChatUrl(videoId) {
    const environment = config?.environment || 'local';

    if (environment === 'production') {
        return `https://lekkerspeuren.nl/chats/chat_${videoId}.json`;
    } else {
        // Local development
        return `http://127.0.0.1:3000/chat_${videoId}.json`;
    }
}

/**
 * Check if the current video is a Lekker Spelen video
 */
function isLekkerSpelen() {
    // Check for common Lekker Spelen indicators
    const title = document.title.toLowerCase();
    const channelElement = document.querySelector('#channel-name a, .ytd-channel-name a, ytd-video-owner-renderer a');
    const channelName = channelElement ? channelElement.textContent.toLowerCase() : '';

    const lekkerIndicators = [
        'lekker spelen',
        'lekker-spelen',
        'lekkerspelen'
    ];

    // Check if title or channel contains Lekker Spelen indicators
    const isLekker = lekkerIndicators.some(indicator =>
        title.includes(indicator) || channelName.includes(indicator)
    );

    // Also check if we have chat data for this video (from yt-ttv.json mapping)
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get("v");

    if (videoId && ttvLink && ttvLink[videoId]) {
        return true; // We have chat data for this video
    }

    return isLekker;
}

/**
 * Handle messages from popup and other parts of extension
 */
function handleMessage(request, sender, sendResponse) {
    console.log('Received message:', request);

    switch (request.action) {
        case 'updateSettings':
            const oldOffset = config?.timeOffset;
            config = { ...config, ...request.settings };
            console.log('Settings updated:', config);

            // If offset changed and chat is active, refresh the chat display
            if (oldOffset !== config.timeOffset && isActive && video) {
                refreshChatWithNewOffset();
            }

            sendResponse({ success: true });
            break;

        case 'resetChat':
            cleanup();
            if (config?.enableSync) {
                setTimeout(init, 100);
            }
            sendResponse({ success: true });
            break;

        case 'getStatus':
            sendResponse({
                status: isActive,
                message: isActive ? 'Chat synchronized' : 'Not synchronized',
                config: config
            });
            break;

        case 'getCurrentTime':
            if (video) {
                sendResponse({ currentTime: video.currentTime });
            } else {
                sendResponse({ error: 'No video element found' });
            }
            break;

        case 'checkLekkerSpelen':
            sendResponse({ isLekkerSpelen: isLekkerSpelen() });
            break;

        default:
            sendResponse({ error: 'Unknown action' });
    }

    // Return true to indicate that the response is sent asynchronously
    return true;
}

/**
 * Refresh chat display when offset changes
 */
function refreshChatWithNewOffset() {
    if (!video || !chatData || !messageList) return;

    console.log('Refreshing chat with new offset:', getTimeOffset());

    // Clear current messages
    shownMessages.clear();
    messageList.innerHTML = "";

    // Reset last second to force recalculation
    lastSecond = -1;

    // Show appropriate messages for current video time
    const currentSecond = Math.floor(video.currentTime);
    showPreviousMessages(currentSecond);
}

/**
 * Initialize the extension and start chat synchronization
 */
const init = async () => {
    try {
        console.log('Initializing Twitch chat sync...');

        // Load YouTube to Twitch video mapping
        if (!ttvLink) {
            const ttvLinkResponse = await fetch(browserAPI.getURL("data/yt-ttv.json"));
            if (!ttvLinkResponse.ok) {
                throw new Error('Failed to load video mapping data');
            }
            ttvLink = await ttvLinkResponse.json();
        }

        // Get current YouTube video ID
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get("v");

        if (!videoId || !ttvLink[videoId]) {
            console.log(`No Twitch chat data available for video ID: ${videoId || 'none'}`);
            cleanup();
            return;
        }

        console.log(`Found mapping for video ${videoId} -> Twitch ${ttvLink[videoId]}`);

        // Load image/emote data if not already loaded
        if (!imageData) {
            const imageResponse = await fetch(browserAPI.getURL("data/image_ids.json"));
            if (!imageResponse.ok) {
                throw new Error('Failed to load image data');
            }
            imageData = await imageResponse.json();
        }

        // Load chat data
        const chatUrl = getChatUrl(ttvLink[videoId]);
        const chatResponse = await fetch(chatUrl);
        if (!chatResponse.ok) {
            throw new Error(`Failed to load chat data from ${chatUrl}`);
        }
        chatData = await chatResponse.json();

        console.log(`Loaded chat data with ${chatData.comments?.length || 0} messages`);

        // Initialize UI and video sync
        await waitForChatContainer();
        await onVideoReady();

        isActive = true;
        console.log('Twitch chat sync initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Twitch chat sync:', error);
    }
};

/**
 * Clean up intervals and reset state
 */
function cleanup() {
    if (shownMessages) {
        shownMessages.clear();
    }

    if (messageList) {
        messageList.innerHTML = "";
    }

    if (videoInterval) {
        clearInterval(videoInterval);
        videoInterval = null;
    }

    lastSecond = -1;
    video = null;
    isActive = false;
}

// Set up message listener
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener(handleMessage);
} else if (typeof browser !== 'undefined' && browser.runtime) {
    browser.runtime.onMessage.addListener(handleMessage);
}

// Initialize the extension
(async () => {
    await initConfig();

    if (config?.enableSync !== false) {
        await init();
    }
})();

// Monitor URL changes for YouTube navigation
let lastUrl = location.href;
setInterval(async () => {
    if (location.href !== lastUrl) {
        console.log('URL changed, reinitializing...');
        lastUrl = location.href;
        cleanup();

        if (config?.enableSync !== false) {
            await init();
        }
    }
}, CONSTANTS.URL_CHECK_INTERVAL);