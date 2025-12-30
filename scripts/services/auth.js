export const BRIDGE_URL = "https://task-alarms-oauth-bridge.pages.dev";

/**
 * finalizes device registration with Cloudflare bridge
 */
export async function handleDeviceRegistration(proof) {
    const { device_id } = await chrome.storage.local.get("device_id");

    try {
        const response = await fetch(`${BRIDGE_URL}/auth/register-device`, {
            method: "POST",
            body: JSON.stringify({ oauth_proof: proof, device_id }),
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) throw new Error("Registration failed");

        const data = await response.json();
        await chrome.storage.local.set({ device_key: data.device_key });
        return { success: true };
    } catch (err) {
        console.error("Registration error:", err);
        return { success: false, error: err.message };
    }
}

/**
 * gets or refreshes the access token
 */
export async function getAccessToken() {
    const cache = await chrome.storage.local.get(["cached_token", "token_expiry"]);

    if (cache.cached_token && cache.token_expiry && Date.now() < cache.token_expiry) {
        return { access_token: cache.cached_token };
    }

    const { device_key } = await chrome.storage.local.get("device_key");
    if (!device_key) return { error: "NOT_AUTHORIZED" };

    try {
        console.log("Fetching new token from Cloudflare...");
        const response = await fetch(`${BRIDGE_URL}/auth/refresh-token`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${device_key}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                await chrome.storage.local.remove(["device_key", "cached_token", "token_expiry"]);
                return { error: "NOT_AUTHORIZED" };
            }
            throw new Error("Refresh failed");
        }

        const data = await response.json();
        const expiryTime = Date.now() + (data.expires_in * 1000) - 60000;
        await chrome.storage.local.set({
            cached_token: data.access_token,
            token_expiry: expiryTime
        });

        return { access_token: data.access_token };
    } catch (err) {
        console.error("Token refresh error:", err);
        return { error: "SERVER_ERROR" };
    }
}
