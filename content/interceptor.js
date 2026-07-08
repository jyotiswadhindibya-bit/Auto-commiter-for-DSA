// Monkey-patch fetch to intercept LeetCode submissions
(function() {
    console.log('[DSA Auto-Commit] Interceptor injected successfully!');
    
    const originalFetch = window.fetch;
    let pendingSubmission = null;

    window.fetch = async function(...args) {
        let url = args[0];
        let options = args[1] || {};

        if (typeof url !== 'string' && url.url) {
            url = url.url; // Handle Request object
        }
        
        // Log all fetch requests briefly to debug
        if (url.includes('/submit/') || url.includes('/check/')) {
            console.log('[DSA Auto-Commit] Fetch intercepted:', url);
        }

        // Intercept Submission POST
        if (typeof url === 'string' && url.includes('/submit/')) {
            try {
                if (options && options.body) {
                    const body = JSON.parse(options.body);
                    const match = url.match(/\/problems\/(.+)\/submit\/?/);
                    if (match && body.lang && body.typed_code) {
                        pendingSubmission = {
                            problemSlug: match[1],
                            lang: body.lang,
                            code: body.typed_code
                        };
                        console.log('[DSA Auto-Commit] Captured submission code for:', pendingSubmission.problemSlug);
                    }
                }
            } catch (e) {
                console.error('[DSA Auto-Commit] Error intercepting submit:', e);
            }
        }

        const response = await originalFetch.apply(this, args);

        // Intercept Status Check GET
        if (typeof url === 'string' && url.includes('/check/') && pendingSubmission) {
            const clone = response.clone();
            clone.json().then(data => {
                console.log('[DSA Auto-Commit] Check response data:', data);
                if (data.state === 'SUCCESS') {
                    if (data.status_msg === 'Accepted') {
                        console.log('[DSA Auto-Commit] Submission Accepted! Sending to background...');
                        // Send message to content script
                        window.postMessage({
                            type: 'LEETCODE_SUBMISSION_ACCEPTED',
                            payload: {
                                ...pendingSubmission,
                                runtime: data.status_runtime,
                                memory: data.status_memory || data.memory,
                                runtimePercentile: data.runtime_percentile,
                                memoryPercentile: data.memory_percentile
                            }
                        }, '*');
                        pendingSubmission = null; // Reset
                    } else if (data.status_msg) {
                        console.log(`[DSA Auto-Commit] Submission finished with status: ${data.status_msg}. Not committing.`);
                        pendingSubmission = null; // Reset on failure (Wrong Answer, TLE, etc.)
                    }
                }
            }).catch(e => {
                // Ignore JSON parse errors for non-JSON responses
            });
        }

        return response;
    };
})();
