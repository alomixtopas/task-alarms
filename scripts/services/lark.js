import { getAccessToken } from "./auth.js";

/**
 * Fetches all active tasks from Lark using pagination
 */
export async function fetchLarkTasks() {
    console.log("Syncing tasks from Lark...");
    const tokenResult = await getAccessToken();
    if (tokenResult.error) {
        throw new Error(tokenResult.error);
    }

    let allRawTasks = [];
    let pageToken = "";
    let hasMore = true;

    while (hasMore) {
        const url = new URL("https://open.larksuite.com/open-apis/task/v2/tasks");
        url.searchParams.set("completed", "false");
        url.searchParams.set("type", "my_tasks");
        url.searchParams.set("page_size", "50");
        if (pageToken) url.searchParams.set("page_token", pageToken);

        const response = await fetch(url.toString(), {
            headers: {
                "Authorization": `Bearer ${tokenResult.access_token}`
            }
        });

        const result = await response.json();
        if (result.code !== 0) throw new Error(result.msg);

        const items = result.data.items || [];
        allRawTasks = allRawTasks.concat(items);

        hasMore = result.data.has_more || false;
        pageToken = result.data.page_token || "";
    }

    return allRawTasks.map(t => {
        let timestamp = t.due?.timestamp;

        // Handle All Day tasks: Set to 18:00 (6 PM) of that day
        if (t.due?.is_all_day && timestamp) {
            const date = new Date(parseInt(timestamp));
            date.setHours(18, 0, 0, 0);
            timestamp = date.getTime().toString();
        }

        return {
            guid: t.guid,
            summary: t.summary,
            due_timestamp: timestamp,
            url: t.url,
            is_all_day: t.due?.is_all_day
        };
    });
}
