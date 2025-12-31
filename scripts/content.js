chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SHOW_ALARM") {
        showLarkAlarm(message.task);
        sendResponse({ success: true });
    }

    if (message.type === "REMOVE_ALARM") {
        const overlayId = 'lark-alarm-' + message.taskId;
        const overlay = document.getElementById(overlayId);
        if (overlay) {
            overlay.remove();
        }
        sendResponse({ success: true });
    }
});

function showLarkAlarm(task) {
    const overlayId = 'lark-alarm-' + task.guid;
    if (document.getElementById(overlayId)) return;

    const now = Date.now();
    const dueTime = task.due_timestamp ? parseInt(task.due_timestamp) : 0;
    const isOverdue = dueTime && now > dueTime;
    const isWarning = dueTime && !isOverdue && (dueTime - now) <= 30 * 60 * 1000; // 30 minutes

    let modalClass = 'lark-alarm-modal';
    let icon = '🔔';
    let headerText = 'Task Reminder';

    if (isOverdue) {
        modalClass += ' lark-overdue';
        icon = '🔥';
        headerText = (typeof LarkMessages !== 'undefined' ? LarkMessages.getRandom('urgent') : "URGENT REMINDER");
    } else if (isWarning) {
        modalClass += ' lark-warning';
        icon = '⚠️';
        headerText = (typeof LarkMessages !== 'undefined' ? LarkMessages.getRandom('warning') : "DEADLINE APPROACHING");
    }

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'lark-alarm-overlay';

    const formatDate = (ts) => {
        if (!ts) return 'Not set';
        const d = new Date(parseInt(ts));
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const dueText = formatDate(task.due_timestamp);

    // Unique ID for the buttons to avoid conflicts when multiple tasks appear
    const dismissBtnId = 'lark-dismiss-btn-' + task.guid;
    const viewBtnId = 'lark-view-btn-' + task.guid;

    overlay.innerHTML = `
        <div class="${modalClass}">
            <div class="lark-alarm-header">
                <img src="${chrome.runtime.getURL('icon.png')}" class="lark-logo-img" alt="Logo">
                <h2>${isOverdue ? '🔥 ' + headerText : (isWarning ? '⚠️ ' + headerText : headerText)}</h2>
            </div>
            <div class="lark-alarm-body">
                <div class="lark-alarm-summary">${task.summary}</div>
                <div class="lark-alarm-due">Due: ${dueText}</div>
            </div>
            <div class="lark-alarm-footer">
                <button class="lark-alarm-btn secondary" id="${viewBtnId}">View Task</button>
                <button class="lark-alarm-btn primary" id="${dismissBtnId}">Dismiss (5m)</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Find transitions inside THIS overlay specifically
    const dismissBtn = overlay.querySelector('#' + dismissBtnId);
    const viewBtn = overlay.querySelector('#' + viewBtnId);

    if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const taskUrl = `https://applink.larksuite.com/client/todo/detail?guid=${task.guid}`;
            window.open(taskUrl, '_blank');
        });
    }

    if (dismissBtn) {
        dismissBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            console.log("Dismiss clicked for task:", task.guid);

            // Send messages to background
            chrome.runtime.sendMessage({ type: "SNOOZE_TASK", taskId: task.guid });
            chrome.runtime.sendMessage({ type: "ALARM_CLOSED", taskId: task.guid });

            // Remove the overlay immediately from DOM
            overlay.remove();
        });
    } else {
        console.error("Could not find dismiss button for task:", task.guid);
        overlay.onclick = () => overlay.remove();
    }
}
