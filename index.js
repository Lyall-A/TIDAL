const path = require("path");
const { app, BrowserWindow, ipcMain, Tray, Menu } = require("electron");
const fs = require("fs");
const RPC = require("./discord-rpc/RPC");
const utils = require("./utils");
const { objectDefaults } = utils;
let config = objectDefaults(JSON.parse(fs.readFileSync("./config.json", "utf-8")), {
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 400,
    playerCheckInterval: 500,
    discordClientId: "1020683907101892709",
    discordRPC: true,
    discordTitle: "TIDAL",
    discordType: 2,
    discordIdleText: "Browing TIDAL",
});

let window;
let tray;
let lastConfigUpdate;
let discordRpc;
let discordRpcReady = false;

updateConfig();

// let playing = { };

if (config.discordRPC) setupDiscordRPC();

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
    discordRpc = new RPC({ clientId: config.discordClientId });
    discordRpc.connectIPC();
    // TODO: check for close
    discordRpc.on("READY", () => {
        console.log("Discord RPC ready");
        discordRpcReady = true;
    });
    // discordRpc.on("ipc-m essage", console.log);
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
    console.log("Updating config");
    config = { ...config, ...newConfig };
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
}

ipcMain.handle("set-idle", (event) => {
    // console.log("Set idle");
    if (discordRpcReady) discordRpc.setActivity({
        name: config.discordTitle,
        type: config.discordType,
        details: config.discordIdleText,
        assets: {
            large_image: "tidal",
            large_text: "TIDAL"
        }
    });
});

ipcMain.handle("set-playing", (event, playing) => {
    // console.log("Set playing", playing);
    if (discordRpcReady) discordRpc.setActivity({
        name: config.discordTitle,
        type: config.discordType,
        details: playing.title,
        state: playing.artist,
        assets: {
            large_image: playing.cover.find(i => i.size === "640x640")?.url,
            large_text: playing.album,
            small_image: "tidal",
            small_text: "TIDAL"
        },
        // NOTE: when using type 2 (Listening) this doesn't show up
        timestamps: {
            start: Date.now() - (playing.currentTime * 1000),
            end: Date.now() + (playing.duration * 1000)
        }
    });
});