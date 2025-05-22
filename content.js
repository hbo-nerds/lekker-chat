let bigData;

const emoteData = {
    "lekkerSicko": "304445721",
    "lekkerDag": "300644885",
    "lekkerDjensen": "716055"
};

function replaceEmotes(content) {
    const fragments = [];
    let lastIndex = 0;

    for (const key in emoteData) {
        const emoteId = emoteData[key];
        const emoteImg = `<img src="https://static-cdn.jtvnw.net/emoticons/v1/${emoteId}/1.0" alt="${key}" class="chat-image chat-line__message--emote">`;
        const emoteRegex = new RegExp(`\\b${key}\\b`, 'g');
        let match;

        while ((match = emoteRegex.exec(content)) !== null) {
            if (match.index > lastIndex) {
                fragments.push(content.substring(lastIndex, match.index));
            }
            fragments.push(emoteImg);
            lastIndex = emoteRegex.lastIndex;
        }
    }

    if (lastIndex < content.length) {
        fragments.push(content.substring(lastIndex));
    }

    return fragments.map(fragment => {
        if (fragment.startsWith('<img')) {
            return `<div class='chat-emote'><span><div class='chat-image__container'>${fragment}</div></span></div>`;
        } else {
            return `<span class="text-fragment" data-a-target="chat-message-text">${fragment}</span>`;
        }
    }).join('');
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

    const author = bigData.commenters[msg.commenter];

    const badgesSpan = vodMessageDiv3.appendChild(document.createElement("span"));
    author.badges.forEach(badge => {
        const badgeDiv = badgesSpan.appendChild(document.createElement("div"));
        badgeDiv.className = "badge-box";

        const badgeA = badgeDiv.appendChild(document.createElement("a"));
        badgeA.setAttribute("href", "#");
        const badgeImg = badgeA.appendChild(document.createElement("img"));
        // TODO
        badgeImg.setAttribute("src", `https://static-cdn.jtvnw.net/badges/v1/1/1`);
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
let vod_offset = 362;

function showMessage(comment) {
    const isAtBottom = messageList.scrollTop == null ? false : Math.abs(messageList.scrollTop + messageList.clientHeight - messageList.scrollHeight) < 5;

    shownMessages.add(comment);
    messageList.appendChild(createChatMessage(comment));

    if (isAtBottom) {
        messageList.scrollTop = messageList.scrollHeight;
    }
}

function injectChat(chatContainer) {
    if (!chatContainer) return;

    chatContainer.innerHTML = "";
    messageList = chatContainer.appendChild(document.createElement("ul"));
    messageList.className = "chat-message-list";

    console.log("Injected Twitch chat!");
}

function waitForChatContainer() {
    const checkExist = setInterval(() => {
        const chatContainer = document.querySelector("#chat");
        if (chatContainer) {
            clearInterval(checkExist);
            injectChat(chatContainer);
        }
    }, 1000);
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
    const firstIdx = [...bigData.comments].reverse().findIndex(comment =>
        (comment.content_offset_seconds + vod_offset) < second
    );
    if (firstIdx !== -1) {
        const startIdx = Math.max(0, firstIdx - 25);
        for (let i = startIdx; i < firstIdx; i++) {
            const comment = bigData.comments[i];
            if (!shownMessages.has(comment)) {
                showMessage(comment);
            }
        }
    }
}

function showMissedMessages(from, to) {
    for (let sec = from; sec <= to; sec++) {
        const missedComments = bigData.comments.filter(comment =>
            (comment.content_offset_seconds + vod_offset) === sec && !shownMessages.has(comment)
        );
        missedComments.forEach(comment => showMessage(comment));
    }
}

function showCurrentSecondMessages(currentSecond) {
    const commentsThisSecond = bigData.comments.filter(comment =>
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

async function onVideoReady() {
    const video = await getVideoElement();
    let lastSecond = -1;

    setInterval(() => {
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

// --- MAIN ENTRY POINT ---
(async () => {
    const bigDataBlob = await fetch(chrome.runtime.getURL("data/chat_example.json"));
    bigData = await bigDataBlob.json();

    waitForChatContainer();
    onVideoReady();
})();


// -- Alt entry point for file dropzone --
// (async () => {
//     // Wait for #chat-container to exist
//     function waitForChatContainerElement() {
//         return new Promise(resolve => {
//             const checkExist = setInterval(() => {
//                 const chatContainer = document.querySelector("#chat-container");
//                 if (chatContainer) {
//                     clearInterval(checkExist);
//                     resolve(chatContainer);
//                 }
//             }, 500);
//         });
//     }

//     const chatContainer = await waitForChatContainerElement();
//     const originalHTML = chatContainer.innerHTML;

//     // Make #chat-container a file dropzone
//     chatContainer.innerHTML = `
//         <div id="dropzone" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:2px dashed #888;color:#888;font-size:1.5em;cursor:pointer;">
//             Pleur die JSON erin! 🎈
//         </div>
//     `;

//     const dropzone = document.getElementById("dropzone");

//     dropzone.addEventListener("dragover", (e) => {
//         e.preventDefault();
//         dropzone.style.borderColor = "#4a90e2";
//         dropzone.style.color = "#4a90e2";
//     });

//     dropzone.addEventListener("dragleave", (e) => {
//         e.preventDefault();
//         dropzone.style.borderColor = "#888";
//         dropzone.style.color = "#888";
//     });

//     dropzone.addEventListener("drop", async (e) => {
//         e.preventDefault();
//         dropzone.style.borderColor = "#888";
//         dropzone.style.color = "#888";
//         const file = e.dataTransfer.files[0];
//         if (!file || !file.name.endsWith(".json")) {
//             dropzone.textContent = "Please drop a .json file!";
//             return;
//         }
//         dropzone.textContent = "Loading chat data...";

//         try {
//             const text = await file.text();
//             bigData = JSON.parse(text);

//             // Remove dropzone and inject chat
//             chatContainer.innerHTML = originalHTML;
//             injectChat(document.querySelector("#chat"));
//             onVideoReady();
//         } catch (err) {
//             dropzone.textContent = "Failed to load or parse JSON!";
//         }
//     });
// })();