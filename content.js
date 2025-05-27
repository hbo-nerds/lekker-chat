let chatData;
let imageData;
let videoInterval;
let chatInterval;
let vodOffset = 362;

function replaceEmotes(content) {
    if (!imageData || !imageData['emoticons']) return content;

    return content.split(/\s+/).map(word => {
        const emoteId = imageData['emoticons'][word];
        if (emoteId) {
            const emoteImg = `<img src="https://static-cdn.jtvnw.net/emoticons/v1/${emoteId}/1.0" alt="${word}" class="chat-image chat-line__message--emote">`;
            return `<div class='chat-emote'><span><div class='chat-image__container'>${emoteImg}</div></span></div>`;
        } else {
            return `<span class="text-fragment" data-a-target="chat-message-text">${word}</span>`;
        }
    }).join(' ');
}

function createChatMessage(msg) {
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
    author.badges.forEach(badge => {
        if (!imageData['badges'][badge._id]) {
            return;
        }

        const badgeDiv = badgesSpan.appendChild(document.createElement("div"));
        badgeDiv.className = "badge-box";

        const badgeA = badgeDiv.appendChild(document.createElement("a"));
        const badgeImg = badgeA.appendChild(document.createElement("img"));
        const id = imageData['badges'][badge._id][parseInt(badge.version)];
        if (!id) {
            console.log(`Badge version ${badge.version} not found for badge ID ${badge._id}`);
        }
        badgeImg.setAttribute("src", `https://static-cdn.jtvnw.net/badges/v1/${imageData['badges'][badge._id][parseInt(badge.version)]}/1`);
        badgeImg.className = "chat-badge";
    });

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

let messageList;
let shownMessages = new Set();

function setVodOffset(offset) {
    vodOffset = offset;
}

function showMessage(comment) {
    const isAtBottom = messageList.scrollTop == null ? false : Math.abs(messageList.scrollTop + messageList.clientHeight - messageList.scrollHeight) < 5;

    shownMessages.add(comment);
    messageList.appendChild(createChatMessage(comment));

    if (isAtBottom) {
        messageList.scrollTop = messageList.scrollHeight;
    }
}

function injectOffsetControl() {
    let container = document.getElementById("#above-the-fold");
    let controls = document.createElement("div");
    controls.id = "lc-controls";
    let offsetControl = document.createElement("div").id("lc-offset-control");
    offsetControl.textContent("Hier komt offset");
    controls.appendChild(offsetControl);
    container.prependChild(controls);
}

function injectChat(chatContainer) {
    if (!chatContainer) return;

    chatContainer.innerHTML = "";
    messageList = chatContainer.appendChild(document.createElement("ul"));
    messageList.className = "chat-message-list";

    console.log("Injected Twitch chat!");
}

function waitForChatContainer() {
    return new Promise(resolve => {
        const checkExist = setInterval(() => {
            const chatContainer = document.querySelector("#chat");
            if (chatContainer) {
                clearInterval(checkExist);
                injectChat(chatContainer);
                resolve(chatContainer);
            }
        }, 1000);
    });
}

function getVideoElement() {
    return new Promise(resolve => {
        const checkInterval = setInterval(() => {
            const video = document.querySelector('video');
            if (video) {
                clearInterval(checkInterval);
                resolve(video);
            }
        }, 500);
    });
}

function showPreviousMessages(second) {
    const firstIdx = [...chatData.comments].reverse().findIndex(comment =>
        (comment.content_offset_seconds + vod_offset) < second
    );
    if (firstIdx !== -1) {
        const startIdx = Math.max(0, firstIdx - 25);
        for (let i = startIdx; i < firstIdx; i++) {
            const comment = chatData.comments[i];
            if (!shownMessages.has(comment)) {
                showMessage(comment);
            }
        }
    }
}

function showMissedMessages(from, to) {
    for (let sec = from; sec <= to; sec++) {
        const missedComments = chatData.comments.filter(comment =>
            (comment.content_offset_seconds + vod_offset) === sec && !shownMessages.has(comment)
        );
        missedComments.forEach(comment => showMessage(comment));
    }
}

function showCurrentSecondMessages(currentSecond) {
    const commentsThisSecond = chatData.comments.filter(comment =>
        (comment.content_offset_seconds + vod_offset) === currentSecond && !shownMessages.has(comment)
    );
    const count = commentsThisSecond.length;
    if (count > 0) {
        commentsThisSecond.forEach((comment, idx) => {
            setTimeout(() => {
                showMessage(comment);
            }, (idx * 1000) / count);
        });
    }
}

let video;
let lastSecond = -1;
async function onVideoReady() {
    video = await getVideoElement();

    if (videoInterval) {
        shownMessages.clear();
        messageList.innerHTML = "";
        return;
    }

    videoInterval = setInterval(() => {
        const currentSecond = Math.floor(video.currentTime);
        if (currentSecond !== lastSecond) {
            if (Math.abs(currentSecond - lastSecond) > 15) {
                shownMessages.clear();
                messageList.innerHTML = "";
                showPreviousMessages(currentSecond);
            } else if (Math.abs(currentSecond - lastSecond) > 1) {
                const from = Math.min(lastSecond, currentSecond) + 1;
                const to = Math.max(lastSecond, currentSecond);
                showMissedMessages(from, to);
            }

            lastSecond = currentSecond;
            showCurrentSecondMessages(currentSecond);
        }
    }, 100);
}

const init = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get("v");

    const streamId = await browser.runtime.sendMessage({type: "checkVideoId", body: { videoId }})
    console.log(streamId);
    
    if (!videoId || !streamId) {
        if (shownMessages) {
            shownMessages.clear();
        }

        if (messageList) {
            messageList.innerHTML = "";
        }

        clearInterval(videoInterval);
        videoInterval = null;

        return;
    }

    // injectOffsetControl();

    if (!imageData) {
        const imageResponse = await fetch(chrome.runtime.getURL("data/image_ids.json"));
        imageData = await imageResponse.json();
    }

    // const bigDataResponse = await fetch(`http://127.0.0.1:3000/chat_${ttvLink[videoId]}.json`);
    // chatData = await bigDataResponse.json();
    console.log("Loading chat data");

    let chatData = await browser.runtime.sendMessage({type: "fetchChatLogs", body: { streamId }});

    // chatDataResponse = await fetch(chrome.runtime.getURL("data/chat_373395874.json"));
    // chatData = await chatDataResponse.json();
    console.log(chatData);
    await waitForChatContainer();
    await onVideoReady();
};

init();

let lastUrl = location.href;
setInterval(async () => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        init();
    }
}, 1000);