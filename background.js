function cacheYtTtv(ytTtv) {

}

function fetchYtTtv() {
    return new Promise((resolve, reject) => {
        fetch("http://localhost:3000/api/v1/yt-ttv")
            .then(response => response.json())
            .then(data => resolve(data))
            .catch(err => reject(err));
    }) 
}

function readCache() {
    return new Promise((resolve, reject) => {
        browser.storage.local.get("cached_yt_ttv")
            .then(result => resolve(result));
    })
}

function storeCache(streams) {
    return new Promise((resolve, reject) => {
        let cached_yt_ttv = { date: new Date().getTime(), yt_ttv: {"123123": "blablabla"} }
        browser.storage.local.set(cached_yt_ttv)
        resolve();
    })
}

function checkStreamId(streamId) {
    return new Promise((resolve, reject) => {
        const requestedStream = "123123";
        readCache()
            .then(cache => {
                let lastWeek = new Date().getTime() - 604800000;

                if (Object.keys(cache).length > 0 && cache.date > lastWeek) {
                    // compare yt_ttv from cached list
                } else {
                    let streams = fetchYtTtv();
                    storeCache(streams);
                    let stream = streams[requestedStream];
                    if (!stream) reject();
                    else resolve(stream);
                }
            })
    });
}

browser.runtime.onMessage.addListener((data, sender) => {
    console.log("Message received from ", sender);
    if (data.type === "checkStreamId") {
        console.log(data.body.streamId);
        return checkStreamId(data.body.streamId);
    }
})
