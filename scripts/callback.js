// Extract oauth_proof from URL fragment
const url = new URL(window.location.href);
const fragment = new URLSearchParams(url.hash.substring(1));
const proof = fragment.get("oauth_proof");

const msgEl = document.getElementById('msg');
const subMsgEl = document.getElementById('sub-msg');
const closeBtn = document.getElementById('close-btn');

if (proof) {
    // Pass proof to background to finalize registration
    chrome.runtime.sendMessage({
        type: "REGISTER_DEVICE",
        oauth_proof: proof
    }, (response) => {
        if (response && response.success) {
            msgEl.innerText = "Success!";
            subMsgEl.innerText = "Your device has been registered. You can close this tab now.";
            closeBtn.style.display = "block";
        } else {
            msgEl.innerText = "Registration Failed";
            subMsgEl.innerText = response?.error || "Please try again later.";
            closeBtn.style.display = "block";
            closeBtn.innerText = "Try Again";
        }
    });
} else {
    msgEl.innerText = "Invalid Request";
    subMsgEl.innerText = "No authentication proof found in URL.";
}

closeBtn.addEventListener("click", () => {
    window.close();
});
