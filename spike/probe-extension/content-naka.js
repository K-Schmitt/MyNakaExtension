// Context C: ask the service worker to call SensCritique while the user is on a Naka page.
chrome.runtime.sendMessage({ type: "probe-from-naka" });
