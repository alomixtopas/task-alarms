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

const activeAlarms = new Set();

async function processTasks(tasks) {
    const now = Date.now();
    const { alert_offset, alert_no_deadline = false } = await chrome.storage.local.get(["alert_offset", "alert_no_deadline"]);
    const { snooze_list = {} } = await chrome.storage.local.get("snooze_list");

    console.log(`Processing ${tasks.length} tasks. Current time: ${new Date(now).toLocaleString()}`);

    // Sort tasks by deadline (earliest first). Missing deadlines go to the end.
    const sortedTasks = [...tasks].sort((a, b) => {
        const tA = a.due_timestamp ? parseInt(a.due_timestamp) : Infinity;
        const tB = b.due_timestamp ? parseInt(b.due_timestamp) : Infinity;
        return tA - tB;
    });

    console.groupCollapsed("🔍 Task Trigger Evaluation Details (Ordered by Deadline)");

    for (const task of sortedTasks) {
        if (!task.due_timestamp) {
            if (alert_no_deadline) {
                const isAlreadyActive = activeAlarms.has(task.guid);
                const snoozedUntil = snooze_list[task.guid] || 0;
                const isSnoozed = now <= snoozedUntil;

                if (!isSnoozed && !isAlreadyActive) {
                    console.log(`[TRIGGER] ❓ ${task.summary} (Untimed Alert Enabled)`);
                    triggerAlarm(task);
                } else {
                    console.log(`[SKIP] ⏳ ${task.summary} (Untimed, Snoozed: ${isSnoozed}, Active: ${isAlreadyActive})`);
                }
            } else {
                console.log(`[IGNORE] ${task.summary}: No deadline set.`);
            }
            continue;
        }

        const dueTime = parseInt(task.due_timestamp);
        const alertOffsetMs = (alert_offset || 15) * 60 * 1000;
        const alertTime = dueTime - alertOffsetMs;

        if (now >= alertTime) {
            const snoozedUntil = snooze_list[task.guid] || 0;
            const isSnoozed = now <= snoozedUntil;
            const isAlreadyActive = activeAlarms.has(task.guid);

            if (!isSnoozed && !isAlreadyActive) {
                console.log(`[TRIGGER] ✅ ${task.summary}`);
                triggerAlarm(task);
            } else {
                console.log(`[SKIP] ⏳ ${task.summary} (Snoozed: ${isSnoozed}, Active: ${isAlreadyActive})`);
            }
        } else {
            const waitMin = Math.round((alertTime - now) / 60000);
            console.log(`[WAIT] 🕒 ${task.summary} (Triggers in ${waitMin} mins)`);
        }
    }
    console.groupEnd();
}

function triggerAlarm(task) {
    if (activeAlarms.has(task.guid)) return;
    activeAlarms.add(task.guid);

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
        const activeTab = tabs?.[0];
        if (activeTab && activeTab.url && !activeTab.url.startsWith('chrome') && !activeTab.url.startsWith('edge')) {
            chrome.tabs.sendMessage(activeTab.id, { type: "SHOW_ALARM", task }, (response) => {
                if (chrome.runtime.lastError) {
                    injectAndShow(activeTab.id, task);
                }
            });
        } else {
            openFallbackWindow(task);
        }
    });
}

async function injectAndShow(tabId, task) {
    try {
        await chrome.scripting.insertCSS({ target: { tabId }, files: ["styles/content.css"] });
        await chrome.scripting.executeScript({ target: { tabId }, files: ["scripts/content.js"] });
        chrome.tabs.sendMessage(tabId, { type: "SHOW_ALARM", task });
    } catch (e) {
        openFallbackWindow(task);
    }
}

function openFallbackWindow(task) {
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
            if (!win) { activeAlarms.delete(task.guid); return; }
            const listener = (id) => {
                if (id === win.id) {
                    activeAlarms.delete(task.guid);
                    chrome.windows.onRemoved.removeListener(listener);
                }
            };
            chrome.windows.onRemoved.addListener(listener);
        });
    });
}
