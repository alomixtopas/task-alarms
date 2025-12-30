# Task Alarms (Chrome Extension)

Don't let your tasks fly away! Task Alarms brings your Lark Tasks directly into your browsing flow with high-visibility alerts and "Angry Duo" energy.

## Features

- **Background Sync**: Pulls your Lark tasks every 5 minutes automatically.
- **High-Visibility Alerts**:
    - **In-Page Overlay**: Large, smooth modals that appear over any webpage.
    - **Fallback Window**: A dedicated popup window for system pages (like `chrome://settings`) where scripts cannot be injected.
- **Smart Statuses**:
    - **Warning (Yellow/Orange)**: Deadline approaching (within 30 mins).
    - **Urgent (Red 🔥)**: Task is already overdue.
    - **Standard (Green)**: General reminder.
- **Stability-Focused UI**: Fixed-height summaries and 1-line truncation ensure the "Dismiss" button is always in the exact same spot for fast interaction.
- **Duo Green Theme**: A vibrant, high-energy green theme inspired by the "Angry Duo" owl, complete with smooth animations and responsive micro-interactions.
- **Customizable Options**:
    - Set custom notification lead times (in minutes).
    - Option to alert for tasks with **No Due Date**.
- **Secure Auth**: Integrates with the Cloudflare OAuth Bridge for a robust and private authentication flow.

## Technical Details

- **Manifest V3**: Using modern extension standards.
- **Storage**: Uses `chrome.storage.local` for task caching and settings.
- **Service Worker Architecture**: Decoupled modules for `auth.js` (bridge interaction) and `lark.js` (API fetching).
- **Zero Dependencies**: Pure HTML, CSS, and Vanilla JS for speed and security.

## Setup

1. Open `edge://extensions` or `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `chrome-extension` folder.
4. Set the `BRIDGE_URL` in `scripts/auth.js` to your deployed Cloudflare Bridge.
5. Click the extension icon and "Connect Lark Account" to start syncing!

## Usage

- **Sync Now**: Force an immediate update and clear all snoozes.
- **Snooze (5m)**: Dismissing a Task Alert will automatically snooze it for 5 minutes if it remains relevant.
- **Logging**: Monitor `Inspect Service Worker` for an organized, expandable view of task evaluation details.

---
🦉 **Alert! Do your tasks!**
