const { ipcRenderer } = require("electron");

let playing = { };
let config;
const tidal = {
    _listeners: [],
    getElement: (dataTestValue) => document.querySelectorAll(`[data-test="${dataTestValue}"]`)[0],
    setIdle: () => ipcRenderer.invoke("set-idle"),
    setPlaying: (i = playing) => ipcRenderer.invoke("set-playing", i),
    on: (event, callback) => { tidal._listeners.push({ event, callback }) },
    once: (event, callback) => { tidal._listeners.push({ event, callback, once: true }) },
    call: (event, ...args) => { tidal._listeners.filter(i => i.event === event).forEach((e, i) => { e.callback(...args); if (e.once) tidal._listeners.splice(i, 1) }) },
}

ipcRenderer.on("config", (event, i) => {
    config = i;

    tidal.setIdle(); // Set as idle on start

    (function checkPlaying() {
        setTimeout(() => checkPlaying(), config.playerCheckInterval);

        const newPlaying = {
            state: tidal.getElement("pause") ? 1 : 0,
            currentTime: tidal.getElement("current-time")?.textContent.split(":").map((value, index) => index === 0 ? value * 60 : index === 1 ? value * 1 : 0).reduce((prev, curr) => curr + prev),
            duration: tidal.getElement("duration")?.textContent.split(":").map((value, index) => index === 0 ? value * 60 : index === 1 ? value * 1 : 0).reduce((prev, curr) => curr + prev),
            hasMetadata: !!navigator.mediaSession.metadata,
            title: navigator.mediaSession.metadata?.title,
            artist: navigator.mediaSession.metadata?.artist,
            album: navigator.mediaSession.metadata?.album,
            cover: navigator.mediaSession.metadata?.artwork.map(i => ({ url: i.src, size: i.sizes }))
        }
        
        if (JSON.stringify(playing) === JSON.stringify(newPlaying)) return;
        
        const oldPlaying = { ...playing };
        playing = newPlaying;

        tidal.call("playing-change", playing, oldPlaying);

        if (playing.title !== oldPlaying.title || playing.album !== oldPlaying.album || playing.artist !== oldPlaying.artist) {
            tidal.call("track-change", playing, oldPlaying);
        }

        if (playing.state !== oldPlaying.state) {
            tidal.call("state-change", playing, oldPlaying);
        }
    })();
});

tidal.on("track-change", () => {
    if (playing.hasMetadata && playing.state === 1) tidal.setPlaying(); else tidal.setIdle();
    if (config.trackInTitle && playing.state === 1) document.title = `${playing.title} - ${playing.artist} - ${playing.album}`; else document.title = "TIDAL";
});

tidal.on("state-change", () => {
    if (playing.hasMetadata && playing.state === 1) tidal.setPlaying(); else tidal.setIdle();
    if (config.trackInTitle && playing.state === 1) document.title = `${playing.title} - ${playing.artist} - ${playing.album}`; else document.title = "TIDAL";
});