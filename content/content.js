// Inject interceptor into the page context (MAIN world) to patch fetch
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/interceptor.js');
script.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the injected script
async function getQuestionDetails(titleSlug) {
    const query = `
    query questionData($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
            questionId
            title
            content
            difficulty
        }
    }`;
    try {
        const res = await fetch('https://leetcode.com/graphql/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, variables: { titleSlug } })
        });
        const json = await res.json();
        return json.data.question;
    } catch (e) {
        console.error('[DSA Auto-Commit Content Script] Error fetching question details:', e);
        return null;
    }
}

window.addEventListener('message', async (event) => {
    // Only accept messages from the same frame
    if (event.source !== window) return;

    if (event.data.type && event.data.type === 'LEETCODE_SUBMISSION_ACCEPTED') {
        const payload = event.data.payload;
        
        console.log('[DSA Auto-Commit Content Script] Received accepted submission. Fetching question details...');
        
        const questionData = await getQuestionDetails(payload.problemSlug);
        if (questionData) {
            payload.questionTitle = questionData.title;
            payload.questionContent = questionData.content;
            payload.difficulty = questionData.difficulty;
        }

        console.log('[DSA Auto-Commit Content Script] Forwarding accepted submission to background script.');
        
        chrome.runtime.sendMessage({
            action: 'commitSolution',
            data: payload
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[DSA Auto-Commit Content Script] Failed to reach background script:', chrome.runtime.lastError.message);
            } else if (response) {
                if (response.success) {
                    console.log('%c[DSA Auto-Commit] SUCCESS: ' + response.message, 'color: #00FF00; font-weight: bold; font-size: 14px;');
                } else {
                    console.error('[DSA Auto-Commit] FAILED: ' + response.error);
                }
            }
        });
    }
});
