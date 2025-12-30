const BRIDGE_URL = "https://task-alarms-oauth-bridge.pages.dev";

document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('status-container');
    const loginBtn = document.getElementById('login-btn');
    const loginContainer = document.getElementById('login-container');
    const syncBtn = document.getElementById('sync-tasks-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const settingsContainer = document.getElementById('settings-container');
    const actionsContainer = document.getElementById('actions-container');
    const offsetInput = document.getElementById('alert-offset-input');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const noDeadlineToggle = document.getElementById('no-deadline-alert-toggle');
    const workHoursOnlyToggle = document.getElementById('work-hours-only-toggle');

    // Check initial state
    const { device_key } = await chrome.storage.local.get("device_key");
    const { alert_offset, alert_no_deadline, work_hours_only } = await chrome.storage.local.get(["alert_offset", "alert_no_deadline", "work_hours_only"]);

    if (alert_offset) offsetInput.value = alert_offset;
    if (alert_no_deadline !== undefined) noDeadlineToggle.checked = alert_no_deadline;
    if (work_hours_only !== undefined) workHoursOnlyToggle.checked = work_hours_only;

    updateUI(!!device_key);

    loginBtn.addEventListener('click', () => {
        const extId = chrome.runtime.id;
        chrome.tabs.create({ url: `${BRIDGE_URL}/login?extension_id=${extId}` });
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const val = parseInt(offsetInput.value);
        const noDeadlineVal = noDeadlineToggle.checked;
        const workHoursOnlyVal = workHoursOnlyToggle.checked;
        if (val > 0) {
            await chrome.storage.local.set({
                alert_offset: val,
                alert_no_deadline: noDeadlineVal,
                work_hours_only: workHoursOnlyVal
            });
            alert("Settings saved!");
            chrome.runtime.sendMessage({ type: "FORCE_SYNC" });
        }
    });

    syncBtn.addEventListener('click', () => {
        syncBtn.innerText = "Syncing...";
        syncBtn.disabled = true;
        chrome.runtime.sendMessage({ type: "FORCE_SYNC" }, (response) => {
            syncBtn.innerText = "Synced!";
            setTimeout(() => {
                syncBtn.innerText = "Sync Tasks Now";
                syncBtn.disabled = false;
            }, 2000);
        });
    });

    logoutBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove("device_key");
        updateUI(false);
    });

    function updateUI(isAuthorized) {
        if (isAuthorized) {
            statusEl.innerText = "Authorized";
            statusEl.className = "status-badge authorized";
            loginContainer.style.display = 'none';
            settingsContainer.style.display = 'block';
            actionsContainer.style.display = 'block';
        } else {
            statusEl.innerText = "Not Authorized";
            statusEl.className = "status-badge unauthorized";
            loginContainer.style.display = 'block';
            settingsContainer.style.display = 'none';
            actionsContainer.style.display = 'none';
        }
    }
});
