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
        playingLargeImage: `@{cover.find(i => i.size === "640x640")?.url || "tidal"}`,
        playingLargeText: "{album}",
        playingSmallImage: "tidal",
        playingSmallText: "TIDAL",
        playingTimestamps: true,
        idlePresence: true,
        idleType: 0,
        idleLargeImage: "tidal",
        idleLargeText: "TIDAL",
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

const lock = app.requestSingleInstanceLock();

if (!lock) {
    console.log("Instance already running!");
    app.quit();
} else {
    app.on("second-instance", () => window.show());

    app.whenReady().then(() => {
        updateConfig();
        if (config.discord.rpc) setupDiscordRPC();
        
        tray = new Tray(path.join(__dirname, "tray.png"));
        tray.setToolTip("TIDAL");
        tray.on("click", () => window.show());
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: "Show", click: () => window.show() },
            { type: "separator" },
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
}

function setupDiscordRPC() {
    console.log("Setting up Discord RPC");
    discordRpc = new RPC({ clientId: config.discord.clientId });
    discordRpc.connectIPC();
    discordRpc.on("READY", () => {
        console.log("Discord RPC ready");
        discordRpcReady = true;
    });
    discordRpc.on("ipc-end", () => {
        console.log("Discord RPC closed");
        setTimeout(() => discordRpc.connectIPC(), 1000);
    });
    discordRpc.on("ipc-error", err => {
        console.log("Failed to connect to Discord RPC");
        setTimeout(() => discordRpc.connectIPC(), 10000);
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

function formatString(str, obj = { }) {
    let formatted = str || "";

    // {}: Variable
    formatted = formatted.replace(/\\?(?<!@){(.+?)}/g, (match, value) => {
        if (match.startsWith("\\")) return match.replace("\\", "");
        return value.split(".").reduce((acc, curr) => acc?.[curr], obj);
    });

    // @{}: Eval with variables
    formatted = formatted.replace(/\\?@{(.+?)}/g, (match, value) => {
        if (match.startsWith("\\")) return match.replace("\\", "");
        try {
            return eval(`${Object.entries(obj).map(i => `let ${i[0]} = ${JSON.stringify(i[1])};`).join("")}${value}`);
        } catch (err) {
            return;
        }
    });
    return formatted;
}

ipcMain.handle("set-idle", (event) => {
    // console.log("Set idle");
    if (discordRpcReady) {
        if (config.discord.idlePresence) {
            discordRpc.setActivity({
                name: formatString(config.discord.idleName || config.discord.title, { config }) || undefined,
                type: config.discord.idleType,
                details: formatString(config.discord.idleDetails, { config }) || undefined,
                state: formatString(config.discord.idleState, { config }) || undefined,
                assets: {
                    large_image: formatString(config.discord.idleLargeImage, { config }) || undefined,
                    large_text: formatString(config.discord.idleLargeText, { config }) || undefined,
                    small_image: formatString(config.discord.idleSmallImage, { config }) || undefined,
                    small_text: formatString(config.discord.idleSmallText, { config }) || undefined
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
                name: formatString(config.discord.playingName || config.discord.title, { config, ...playing }) || undefined,
                type: config.discord.playingType,
                details: formatString(config.discord.playingDetails, { config, ...playing }) || undefined,
                state: formatString(config.discord.playingState, { config, ...playing }) || undefined,
                assets: {
                    large_image: formatString(config.discord.playingLargeImage, { config, ...playing }) || undefined,
                    large_text: formatString(config.discord.playingLargeText, { config, ...playing }) || undefined,
                    small_image: formatString(config.discord.playingSmallImage, { config, ...playing }) || undefined,
                    small_text: formatString(config.discord.playingSmallText, { config, ...playing }) || undefined
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