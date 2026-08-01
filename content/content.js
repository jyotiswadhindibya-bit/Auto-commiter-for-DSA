
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/interceptor.js');
script.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

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

    if (event.source !== window) return;

    if (event.data.type === 'LEETCODE_SUBMISSION_ACCEPTED') {
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
    if (event.data.type === 'GFG_SUBMISSION_ACCEPTED') {
        const payload = event.data.payload;
        console.log('[DSA Auto-Commit Content Script] Received GFG submission. Extracting details...');

        // Extract Title from DOM
        const titleEl = document.querySelector('.g-m-0, h3, .problem-title');
        payload.questionTitle = titleEl ? titleEl.innerText.trim() : payload.problemSlug;

        // Extract Difficulty
        const diffEl = document.querySelector('.strong, .problem-difficulty');
        payload.difficulty = diffEl ? diffEl.innerText.trim() : 'Unknown';

        // Extract Description HTML
        let descEl = document.querySelector('.problem-statement') || 
                     document.querySelector('div[class*="problems_problem_content"]') || 
                     document.querySelector('div[class*="problemQuestion"]');
                     
        if (!descEl) {
            // Bulletproof Algorithmic Fallback: Lowest Common Ancestor of 'Examples' and 'Constraints'
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let examplesNode = null;
            let constraintsNode = null;
            
            while ((node = walker.nextNode())) {
                const text = node.nodeValue.trim();
                if (!examplesNode && (text.includes('Examples:') || text.includes('Example 1') || text.includes('Example:'))) {
                    examplesNode = node;
                }
                if (!constraintsNode && text.includes('Constraints:')) {
                    constraintsNode = node;
                }
            }
            
            if (examplesNode && constraintsNode) {
                let parent = examplesNode.parentElement;
                // Walk up the DOM until the parent also contains the Constraints node
                while (parent && !parent.contains(constraintsNode.parentElement)) {
                    parent = parent.parentElement;
                }
                descEl = parent;
            }
        }
        
        payload.questionContent = descEl ? descEl.innerHTML : '<p>Problem description not available.</p>';

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
