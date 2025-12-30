import { fetchLarkTasks } from "./services/lark.js";
import { getAccessToken, handleDeviceRegistration, BRIDGE_URL } from "./services/auth.js";

// Initialize
chrome.runtime.onInstalled.addListener(async () => {
    // Device ID
    const { device_id } = await chrome.storage.local.get("device_id");
    if (!device_id) {
        const newDeviceId = self.crypto.randomUUID();
        await chrome.storage.local.set({ device_id: newDeviceId });
    }

    // Default settings
    const { alert_offset } = await chrome.storage.local.get("alert_offset");
    if (alert_offset === undefined) {
        await chrome.storage.local.set({ alert_offset: 15 }); // 15 minutes before
    }

    // Create periodic alarm for task sync (every 1 minute)
    chrome.alarms.create("SYNC_TASKS", { periodInMinutes: 1 });
    console.log("Task sync alarm created (1 min interval)");
});

// Handle Alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "SYNC_TASKS") {
        const now = new Date();
        const minutes = now.getMinutes();

        // 1. Fetch from Lark only every 5 minutes (when minute is 0, 5, 10, etc.)
        if (minutes % 5 === 0) {
            console.log(`Minute ${minutes}: Polling Lark API...`);
            await syncLarkTasks();
        } else {
            // 2. Otherwise, just process existing local tasks
            console.log(`Minute ${minutes}: Checking local tasks...`);
            const { lark_tasks = [] } = await chrome.storage.local.get("lark_tasks");
            await processTasks(lark_tasks);
        }
    }
});

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "REGISTER_DEVICE") {
        handleDeviceRegistration(message.oauth_proof).then(sendResponse);
        return true;
    }

    if (message.type === "GET_ACCESS_TOKEN") {
        getAccessToken().then(sendResponse);
        return true;
    }

    if (message.type === "FORCE_SYNC") {
        activeAlarms.clear();
        chrome.storage.local.set({ snooze_list: {} }, () => {
            syncLarkTasks().then(() => sendResponse({ success: true }));
        });
        return true;
    }

    if (message.type === "SNOOZE_TASK") {
        snoozeTask(message.taskId).then(sendResponse);
        return true;
    }

    if (message.type === "ALARM_CLOSED") {
        activeAlarms.delete(message.taskId);
        console.log(`Alarm slot freed for task: ${message.taskId}`);
        sendResponse({ success: true });
        return true;
    }
});

async function snoozeTask(taskId) {
    const { snooze_list } = await chrome.storage.local.get("snooze_list") || {};
    const updatedSnooze = { ...(snooze_list || {}), [taskId]: Date.now() + (5 * 60 * 1000) };
    await chrome.storage.local.set({ snooze_list: updatedSnooze });
    return { success: true };
}

async function syncLarkTasks() {
    try {
        const tasks = await fetchLarkTasks();
        await chrome.storage.local.set({ lark_tasks: tasks, last_sync: Date.now() });
        console.log(`Sync complete. Total tasks: ${tasks.length}`);
        await processTasks(tasks);
    } catch (err) {
        if (err.message === "NOT_AUTHORIZED") {
            console.log("Not authorized, skipping sync.");
        } else {
            console.error("Sync error:", err);
        }
    }
}

const activeAlarms = new Map(); // Map<guid, task>
const activeFallbackWindows = new Map(); // Map<guid, windowId>

// Helper to check if a tab is eligible for content script injection
function isEligibleTab(tab) {
    if (!tab || !tab.url) return false;
    const forbiddenProtocols = ['chrome:', 'edge:', 'about:', 'view-source:', 'chrome-extension:'];
    return !forbiddenProtocols.some(protocol => tab.url.startsWith(protocol));
}

async function processTasks(tasks) {
    // ... (logic processTasks giữ nguyên phần đầu cho đến khi gọi triggerAlarm)
    const now = Date.now();
    const { alert_offset, alert_no_deadline = false, work_hours_only = false } = await chrome.storage.local.get(["alert_offset", "alert_no_deadline", "work_hours_only"]);
    const { snooze_list = {} } = await chrome.storage.local.get("snooze_list");

    if (work_hours_only) {
        const date = new Date(now);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const currentTimeInMinutes = hours * 60 + minutes;
        const startMinutes = 8 * 60 + 30; // 08:30
        const endMinutes = 17 * 60 + 30;  // 17:30

        if (currentTimeInMinutes < startMinutes || currentTimeInMinutes > endMinutes) {
            return;
        }
    }

    const sortedTasks = [...tasks].sort((a, b) => {
        const tA = a.due_timestamp ? parseInt(a.due_timestamp) : Infinity;
        const tB = b.due_timestamp ? parseInt(b.due_timestamp) : Infinity;
        return tA - tB;
    });

    for (const task of sortedTasks) {
        if (!task.due_timestamp) {
            if (alert_no_deadline) {
                const isAlreadyActive = activeAlarms.has(task.guid);
                const snoozedUntil = snooze_list[task.guid] || 0;
                if (now > snoozedUntil && !isAlreadyActive) {
                    triggerAlarm(task);
                }
            }
            continue;
        }

        const dueTime = parseInt(task.due_timestamp);
        const alertOffsetMs = (alert_offset || 15) * 60 * 1000;
        const alertTime = dueTime - alertOffsetMs;

        if (now >= alertTime) {
            const snoozedUntil = snooze_list[task.guid] || 0;
            const isAlreadyActive = activeAlarms.has(task.guid);
            if (now > snoozedUntil && !isAlreadyActive) {
                triggerAlarm(task);
            }
        }
    }
}

// Global broadcast to remove alarm from all tabs
function broadcastRemoveAlarm(taskId) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (isEligibleTab(tab)) {
                chrome.tabs.sendMessage(tab.id, { type: "REMOVE_ALARM", taskId }).catch(() => { });
            }
        });
    });

    // Also close fallback window if it exists
    const winId = activeFallbackWindows.get(taskId);
    if (winId) {
        chrome.windows.remove(winId).catch(() => { });
        activeFallbackWindows.delete(taskId);
    }
}

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "REGISTER_DEVICE") {
        handleDeviceRegistration(message.oauth_proof).then(sendResponse);
        return true;
    }
    if (message.type === "GET_ACCESS_TOKEN") {
        getAccessToken().then(sendResponse);
        return true;
    }
    if (message.type === "FORCE_SYNC") {
        activeAlarms.clear();
        activeFallbackWindows.clear();
        chrome.storage.local.set({ snooze_list: {} }, () => {
            syncLarkTasks().then(() => sendResponse({ success: true }));
        });
        return true;
    }
    if (message.type === "SNOOZE_TASK") {
        snoozeTask(message.taskId).then(sendResponse);
        return true;
    }
    if (message.type === "ALARM_CLOSED") {
        activeAlarms.delete(message.taskId);
        broadcastRemoveAlarm(message.taskId);
        sendResponse({ success: true });
        return true;
    }
});

function triggerAlarm(task) {
    const isNew = !activeAlarms.has(task.guid);
    if (isNew) {
        activeAlarms.set(task.guid, task);
    }

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
        const activeTab = tabs?.[0];
        if (activeTab && isEligibleTab(activeTab)) {
            ensureAlarmOnTab(activeTab.id, task);
        } else if (isNew) {
            // Only open fallback once when the alarm first triggers and we're on a system page
            openFallbackWindow(task);
        }
    });
}

function ensureAlarmOnTab(tabId, task) {
    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !isEligibleTab(tab)) return;

        chrome.tabs.sendMessage(tabId, { type: "SHOW_ALARM", task }, (response) => {
            if (chrome.runtime.lastError) {
                injectAndShow(tabId, task);
            }
        });
    });
}

async function injectAndShow(tabId, task) {
    try {
        await chrome.scripting.insertCSS({ target: { tabId }, files: ["styles/content.css"] });
        await chrome.scripting.executeScript({ target: { tabId }, files: ["scripts/content.js"] });
        chrome.tabs.sendMessage(tabId, { type: "SHOW_ALARM", task }).catch(() => { });
    } catch (e) {
        // Fail silently, don't trigger more windows here
    }
}

// Sticky logic: Show active alarms when switching tabs or loading pages
chrome.tabs.onActivated.addListener((activeInfo) => {
    activeAlarms.forEach((task) => {
        ensureAlarmOnTab(activeInfo.tabId, task);
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && isEligibleTab(tab)) {
        activeAlarms.forEach((task) => {
            ensureAlarmOnTab(tabId, task);
        });
    }
});

function openFallbackWindow(task) {
    if (activeFallbackWindows.has(task.guid)) return;

    chrome.windows.getLastFocused({ populate: false }, (currentWin) => {
        const width = 600;
        const height = 500;
        let left = 100, top = 100;

        if (currentWin && currentWin.width) {
            left = Math.round(currentWin.left + (currentWin.width - width) / 2);
            top = Math.round(currentWin.top + (currentWin.height - height) / 2);
        }

        const safeSummary = (task.summary || "No summary").substring(0, 100).replace(/[?&=]/g, ' ');
        const popupUrl = chrome.runtime.getURL(`pages/alarm.html?guid=${task.guid}&title=${encodeURIComponent(safeSummary)}&due=${task.due_timestamp}`);

        chrome.windows.create({
            url: popupUrl, type: "popup", width, height,
            left: Math.max(0, left), top: Math.max(0, top), focused: true
        }, (win) => {
            if (win) {
                activeFallbackWindows.set(task.guid, win.id);
                const listener = (id) => {
                    if (id === win.id) {
                        activeFallbackWindows.delete(task.guid);
                        chrome.windows.onRemoved.removeListener(listener);
                    }
                };
                chrome.windows.onRemoved.addListener(listener);
            }
        });
    });
}
