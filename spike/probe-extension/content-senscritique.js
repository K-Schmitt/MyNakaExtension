// Context B: the fetch is made from the SensCritique page itself (content script).
(async () => {
  const label = "B content script on senscritique.com";
  try {
    const { status, kind } = await callSensCritique();
    chrome.runtime.sendMessage({ type: "probe-result", label, status, kind });
  } catch (error) {
    chrome.runtime.sendMessage({ type: "probe-result", label, status: 0, kind: `network error, ${error.message}` });
  }
})();
