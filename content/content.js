
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

// Codeforces Integration (DOM Observer)
if (window.location.hostname === 'codeforces.com') {
    console.log('[DSA Auto-Commit] Codeforces Content Script active.');

    // 2. Watch for Accepted (only matters on status page)
    if (window.location.href.includes('/status') || window.location.href.includes('/my')) {
        const pendingStr = sessionStorage.getItem('cf_pending_msg');
        if (pendingStr) {
            const payload = JSON.parse(pendingStr);
            
            const checkVerdict = (firstCell, observer) => {
                const text = firstCell.textContent.trim();
                // Codeforces sometimes animates "Running on test 1..." before final verdict
                if (text === 'Accepted' || text === 'Pretests passed') {
                    console.log('[DSA Auto-Commit] Codeforces Submission Accepted! Sending to background...');
                    chrome.runtime.sendMessage({
                        action: 'commitSolution',
                        data: payload
                    });
                    sessionStorage.removeItem('cf_pending_msg');
                    if (observer) observer.disconnect();
                    return true;
                } else if (text !== '' && !text.toLowerCase().includes('running') && !text.toLowerCase().includes('in queue') && text !== 'Testing') {
                    // It finished but failed (e.g., Wrong Answer, TLE, CE)
                    console.log('[DSA Auto-Commit] Codeforces submission finished with verdict:', text);
                    sessionStorage.removeItem('cf_pending_msg');
                    if (observer) observer.disconnect();
                    return true;
                }
                return false;
            };

            const table = document.querySelector('.status-frame-datatable');
            if (table) {
                // Monitor for dynamic websocket updates
                const observer = new MutationObserver((mutations) => {
                    const statusCells = document.querySelectorAll('td.status-verdict-cell');
                    if (statusCells.length > 0) {
                        checkVerdict(statusCells[0], observer);
                    }
                });

                observer.observe(table, { childList: true, subtree: true, characterData: true });

                // Check immediately just in case it's already populated on page load
                const statusCells = document.querySelectorAll('td.status-verdict-cell');
                if (statusCells.length > 0) {
                    checkVerdict(statusCells[0], observer);
                }
            }
        }
    }
}

