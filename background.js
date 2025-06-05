function fetchYtTtv() {
    return new Promise((resolve, reject) => {
        console.log("Making request for yt-ttv");
        fetch("http://localhost:3000/api/v1/yt-ttv")
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(err => reject(err));
    }) 
}

function readCache() {
    return new Promise((resolve, reject) => {
        browser.storage.local.get("cachedStreams")
            .then(result => resolve(result));
    })
}

function storeCache(streams) {
    console.log("Storing streams in cache");
    return new Promise((resolve, reject) => {
        browser.storage.local.set({cachedStreams: {date: new Date().getTime(), streams: streams}})
            .then(res => resolve(res))
            .catch(err => reject(err));
    })
}

function checkVideoId(videoId) {
    return new Promise((resolve, reject) => {
        const requestedStream = videoId;
        readCache()
            .then(cache => {
                let lastWeek = new Date().getTime() - 604800000;
                console.log(cache.cachedStreams.date > lastWeek);
                console.log(Object.keys(cache).length);

                if (Object.keys(cache).length > 0 && cache.cachedStreams.date > lastWeek) {
                    console.log("Cache found from past week");
                    let stream = cache.cachedStreams.streams[videoId];
                    if (!stream) reject();
                    else resolve(stream);

                } else {
                    console.log("No cache found or cache too old");
                    fetchYtTtv()
                        .then(streams => {
                            storeCache(streams)
                                .then(() => console.log("Cache succesfully stored"));
                            let stream = streams[requestedStream];
                            if (!stream) reject("Stream not found");
                            else resolve(stream);
                        })
                }
            })
    });
}

function fetchChatLogs(streamId) {
    return new Promise((resolve, reject) => {
        console.log("Making request for chatlogs");
        fetch(`http://localhost:3000/api/v1/chats/${streamId}`)
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(err => reject(err));
    });
}

function fetchCurrentOffset() {
    return vodOffset;
}

function setOffset(offset) {
    vodOffset = offset;
}

browser.runtime.onMessage.addListener((data, sender) => {
    console.log("Message received from ", sender);
    if (data.type === "checkVideoId") {
        console.log(data.body.videoId);
        return checkVideoId(data.body.videoId);
    } else if (data.type === "fetchChatLogs") {
        return fetchChatLogs(data.body.streamId);
    } else if (data.type === "fetchCurrentOffset") {
        return fetchCurrentOffset();
    } else if (data.type === "setOffset") {
        setOffset(data.body.offset);
    }
})
