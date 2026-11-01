importScripts("probe-body.js");

async function runProbe(label) {
  try {
    const { status, kind } = await callSensCritique();
    console.log(`[probe] ${label}: HTTP ${status}, ${kind}`);
    return { status, kind };
  } catch (error) {
    console.log(`[probe] ${label}: network error, ${error.message}`);
    return { status: 0, kind: "network error" };
  }
}

// Context A: the service worker itself, triggered by a click on the toolbar button.
chrome.action.onClicked.addListener(() => runProbe("A service worker (toolbar click)"));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Context C: the worker called on behalf of a naka.cx page.
  if (message?.type === "probe-from-naka") {
    runProbe("C service worker called from naka.cx").then(sendResponse);
    return true;
  }
  // Context B reports its own result here so every row appears in this one console.
  if (message?.type === "probe-result") {
    console.log(`[probe] ${message.label}: HTTP ${message.status}, ${message.kind}`);
  }
  return false;
});
