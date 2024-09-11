const path = require("path");
const { app, BrowserWindow, ipcMain, Tray, Menu } = require("electron");
const fs = require("fs");
const RPC = require("./discord-rpc/RPC");
const utils = require("./utils");
const { objectDefaults } = utils;
const dataPath = app.getPath("userData");
let configFile;
try { configFile = JSON.parse(fs.readFileSync(path.join(dataPath, "config.json"), "utf-8")) } catch (err) { };
let config = objectDefaults(configFile, {
    x: null,
    y: null,
    width: 800,
    height: 600,
    fullscreen: false,
    discord: {
        rpc: true,
        clientId: "1020683907101892709",
        title: "TIDAL",
        playingPresence: true,
        playingType: 2,
        playingDetails: "{title}",
        playingState: "{artist}",
        playingLargeText: "{album}",
        playingTimestamps: true,
        idlePresence: false,
        idleType: 0,
        idleDetails: "Browsing TIDAL",
        idleState: null,        
    },
    playingTitle: "{title} - {artist}",
    playerCheckInterval: 500,
    trackInTitle: true,
    minWidth: 400,
    minHeight: 400,
    minimizeToSystemTray: true
});

let window;
let tray;
let lastConfigUpdate;
let discordRpc;
let discordRpcReady = false;

updateConfig();

// let playing = { };

if (config.discord.rpc) setupDiscordRPC();

function createWindow() {
    window = new BrowserWindow({
        title: "TIDAL",
        icon: path.resolve(__dirname, "icon.png"),
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        minWidth: config.minWidth,
        minHeight: config.minHeight,
        fullscreen: config.fullscreen,
        webPreferences: {
            preload: path.resolve(__dirname, "preload.js"),
            contextIsolation: true
        }
    });

    window.setMenuBarVisibility(false);

    window.webContents.send("config", config);

    window.loadURL("https://listen.tidal.com");

    window.on("move", () => {
        const [x, y] = window.getPosition();
        updateConfig({ x, y });
    });

    window.on("resize", () => {
        const [width, height] = window.getSize();
        updateConfig({ width, height });
    });

    window.on("enter-full-screen", () => updateConfig({ fullscreen: true }));
    window.on("leave-full-screen", () => updateConfig({ fullscreen: false }));

    window.on("show", () => {
        console.log("Window showed");
    });

    window.on("close", event => {
        if (app.isQuitting || !config.minimizeToSystemTray) return console.log("Closing");
        console.log("Minimizing to system tray");
        event.preventDefault();
        window.hide();
    });
}

app.whenReady().then(() => {
    tray = new Tray(path.join(__dirname, "tray.png"));
    tray.setToolTip("TIDAL");
    tray.on("click", () => window.show());
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: "Show", click: () => window.show() },
        { label: "Quit", click: () => app.fullQuit() },
    ]))

    createWindow();

    app.on("activate", () => {
        if (!BrowserWindow.getAllWindows().length) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.fullQuit = () => {
    app.isQuitting = true;
    app.quit();
}

function setupDiscordRPC() {
    console.log("Setting up Discord RPC");
    discordRpc = new RPC({ clientId: config.discord.clientId });
    discordRpc.connectIPC();
    // TODO: check for close
    discordRpc.on("READY", () => {
        console.log("Discord RPC ready");
        discordRpcReady = true;
    });
    // discordRpc.on("ipc-message", console.log);
}

function updateConfig(newConfig) {
    const date = Date.now();
    if (date - lastConfigUpdate <= 500) {
        const oldLastConfigUpdate = lastConfigUpdate;
        setTimeout(() => {
            if (oldLastConfigUpdate !== lastConfigUpdate) return;
            updateConfig(newConfig);
        }, date - lastConfigUpdate);
        return;
    };
    lastConfigUpdate = Date.now();
    config = { ...config, ...newConfig };
    console.log("Updating config");
    // console.log(config);
    fs.writeFileSync(path.join(dataPath, "config.json"), JSON.stringify(config, null, 4));
}

function formatString(str, obj) {
    return str.replace(/(?<!\\){(.*?)}/g, (match, value) => value.split(".").reduce((prev, curr) => prev?.[curr], obj));
}

ipcMain.handle("set-idle", (event) => {
    // console.log("Set idle");
    if (discordRpcReady) {
        if (config.discord.idlePresence) {
            discordRpc.setActivity({
                name: config.discord.title,
                type: config.discord.idleType,
                details: config.discord.idleDetails,
                state: config.discord.idleState,
                assets: {
                    large_image: "tidal",
                    large_text: "TIDAL"
                }
            });
        } else {
            discordRpc.setActivity();
        }
    }
});

ipcMain.handle("set-playing", (event, playing) => {
    // console.log("Set playing", playing);
    if (discordRpcReady) {
        if (config.discord.playingPresence) {
            discordRpc.setActivity({
                name: config.discord.title,
                type: config.discord.playingType,
                details: formatString(config.discord.playingDetails, { ...playing }),
                state: formatString(config.discord.playingState, { ...playing }),
                assets: {
                    large_image: playing.cover.find(i => i.size === "640x640")?.url, // TODO: idk if this size can be undefined, fallback to diff sizes?
                    large_text: formatString(config.discord.playingLargeText, { ...playing }),
                    small_image: "tidal",
                    small_text: "TIDAL"
                },
                // NOTE: when using type 2 (Listening) this doesn't show up
                timestamps: config.discord.playingTimestamps ? {
                    start: Date.now() - (playing.currentTime * 1000),
                    end: Date.now() + (playing.duration * 1000)
                } : undefined
            });
        }
    }
});