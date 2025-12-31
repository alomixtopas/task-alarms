document.addEventListener('DOMContentLoaded', () => {
    console.log("Alarm popup loaded");
    const urlParams = new URLSearchParams(window.location.search);
    const guid = urlParams.get('guid');
    const title = urlParams.get('title');
    const dueTs = urlParams.get('due');

    const summaryEl = document.getElementById('task-summary');
    const dueEl = document.getElementById('task-due');

    if (summaryEl) summaryEl.innerText = title || "No summary provided";

    const formatDate = (ts) => {
        if (!ts || ts === "undefined") return 'Not set';
        const d = new Date(parseInt(ts));
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    if (dueEl) {
        dueEl.innerText = "Due: " + formatDate(dueTs);

        const now = Date.now();
        const dueTime = parseInt(dueTs);

        if (now > dueTime) {
            document.body.classList.add('overdue');
            const headerTitle = document.getElementById('header-title');
            if (headerTitle) headerTitle.innerText = "🔥 " + (typeof LarkMessages !== 'undefined' ? LarkMessages.getRandom('urgent') : "URGENT REMINDER");
        } else if (dueTime - now <= 30 * 60 * 1000) {
            document.body.classList.add('warning');
            const headerTitle = document.getElementById('header-title');
            if (headerTitle) headerTitle.innerText = "⚠️ " + (typeof LarkMessages !== 'undefined' ? LarkMessages.getRandom('warning') : "DEADLINE APPROACHING");
        }
    }

    const dismissAction = () => {
        if (!guid) { window.close(); return; }
        chrome.runtime.sendMessage({ type: "SNOOZE_TASK", taskId: guid });
        chrome.runtime.sendMessage({ type: "ALARM_CLOSED", taskId: guid }, () => {
            window.close();
        });
    };

    const dismissBtn = document.getElementById('dismiss-btn');
    if (dismissBtn) dismissBtn.addEventListener('click', dismissAction);

    const viewBtn = document.getElementById('view-btn');
    if (viewBtn) {
        viewBtn.addEventListener('click', () => {
            const taskUrl = `https://applink.larksuite.com/client/todo/detail?guid=${guid}`;
            window.open(taskUrl, '_blank');
        });
    }
});
