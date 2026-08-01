
(function () {
    console.log('[DSA Auto-Commit] Interceptor injected successfully!');

    // --- FETCH INTERCEPTOR (LeetCode) ---
    const originalFetch = window.fetch;
    let pendingSubmission = null;

    window.fetch = async function (...args) {
        let url = '';
        let options = args[1] || {};
        let bodyJson = null;

        if (args[0] instanceof Request) {
            url = args[0].url;
            try {
                const clonedReq = args[0].clone();
                const bodyText = await clonedReq.text();
                // Raw body log removed
                if (bodyText) {
                    try {
                        bodyJson = JSON.parse(bodyText);
                    } catch (e) {
                        // Might be form-urlencoded or multipart
                        if (bodyText.includes('WebKitFormBoundary') || bodyText.includes('Content-Disposition')) {
                            bodyJson = {};
                            const parts = bodyText.split(/------[-a-zA-Z0-9]+/);
                            for (const part of parts) {
                                const nameMatch = part.match(/name="([^"]+)"/);
                                if (nameMatch) {
                                    const name = nameMatch[1];
                                    const splitPart = part.split(/\r\n\r\n|\n\n/);
                                    if (splitPart.length > 1) {
                                        let val = splitPart.slice(1).join('\n\n').trim();
                                        bodyJson[name] = val;
                                    }
                                }
                            }
                            // console.log('[DSA Auto-Commit] Extracted Multipart Fields:', Object.keys(bodyJson));
                        } else {
                            bodyJson = Object.fromEntries(new URLSearchParams(bodyText));
                        }
                    }
                }
            } catch (e) {}
        } else {
            url = args[0];
            if (options && typeof options.body === 'string') {
                try {
                    bodyJson = JSON.parse(options.body);
                } catch (e) {
                    bodyJson = Object.fromEntries(new URLSearchParams(options.body));
                }
            }
        }

        if (typeof url === 'string' && url.includes('practiceapiorigin')) {
            // Debug logs removed to reduce noise
        }

        // Intercept GeeksforGeeks Submit (Request Object or Options)
        if (typeof url === 'string' && url.includes('geeksforgeeks.org') && url.includes('/submit/compile/')) {
            const match = url.match(/problems\/(.+?)\/submit\/compile/);
            if (match) {
                let actualCode = '/* Code hidden */';
                try {
                    if (window.monaco && window.monaco.editor && window.monaco.editor.getModels().length > 0) {
                        actualCode = window.monaco.editor.getModels()[0].getValue();
                    } else if (document.querySelector('.CodeMirror') && document.querySelector('.CodeMirror').CodeMirror) {
                        actualCode = document.querySelector('.CodeMirror').CodeMirror.getValue();
                    } else if (bodyJson) {
                        const possibleCode = bodyJson.code || bodyJson.user_code || bodyJson.program || bodyJson.sourceCode || bodyJson.solution;
                        
                        if (possibleCode && !possibleCode.startsWith('http')) {
                            actualCode = possibleCode;
                        } else {
                            for (const key in bodyJson) {
                                const val = bodyJson[key];
                                if (typeof val === 'string' && val.length > 20 && !val.startsWith('http') && 
                                   (val.includes('{') || val.includes(';') || val.includes('def ') || val.includes('import '))) {
                                    actualCode = val;
                                    break;
                                }
                            }
                        }
                    }
                    if (actualCode === '/* Code hidden */') {
                        const monacoLines = document.querySelectorAll('.view-line');
                        if (monacoLines.length > 0) {
                            actualCode = Array.from(monacoLines).map(line => line.innerText || line.textContent).join('\n').replace(/\u200B/g, '');
                        }
                    }
                } catch (e) {
                    console.error('[DSA Auto-Commit] Error extracting GFG code:', e);
                }

                pendingSubmission = {
                    platform: 'gfg',
                    problemSlug: match[1],
                    code: actualCode || '/* Code hidden */',
                    lang: bodyJson ? (bodyJson.language || bodyJson.lang || 'Unknown') : 'Unknown'
                };
                console.log('[DSA Auto-Commit] Captured GFG submission for:', pendingSubmission.problemSlug);
            }
        }

        // Intercept LeetCode Submit (Relative URL)
        if (typeof url === 'string' && url.includes('/submit/') && !url.includes('geeksforgeeks.org')) {
            if (bodyJson) {
                const match = url.match(/\/problems\/(.+)\/submit\/?/);
                if (match && bodyJson.lang && bodyJson.typed_code) {
                    pendingSubmission = {
                        platform: 'leetcode',
                        problemSlug: match[1],
                        code: bodyJson.typed_code,
                        lang: bodyJson.lang
                    };
                    console.log('[DSA Auto-Commit] Captured LeetCode submission code for:', pendingSubmission.problemSlug);
                }
            }
        }


        const response = await originalFetch.apply(this, args);

        if (typeof url === 'string' && pendingSubmission) {
            const clone = response.clone();
            clone.json().then(data => {
                // LeetCode check
                if (pendingSubmission.platform === 'leetcode' && url.includes('/check/')) {
                    if (data.state === 'SUCCESS') {
                        if (data.status_msg === 'Accepted') {
                            console.log('[DSA Auto-Commit] LeetCode Submission Accepted! Sending to background...');
                            window.postMessage({
                                type: 'LEETCODE_SUBMISSION_ACCEPTED',
                                payload: {
                                    ...pendingSubmission,
                                    runtime: data.status_runtime,
                                    memory: data.memory,
                                    runtimePercentile: data.runtime_percentile,
                                    memoryPercentile: data.memory_percentile
                                }
                            }, '*');
                            pendingSubmission = null;
                        } else if (data.status_msg) {
                            console.log(`[DSA Auto-Commit] Submission finished with status: ${data.status_msg}. Not committing.`);
                            pendingSubmission = null;
                        }
                    }
                }
                
                // GFG check
                if (pendingSubmission.platform === 'gfg' && url.includes('/submission/submit/result')) {
                    const isCorrect = data.status === 'CORRECT' || 
                                      (data.result && data.result.status === 'CORRECT') || 
                                      (data.status === 'SUCCESS' && (data.view_mode === 'correct' || data.sub_status === 1));
                                      
                    const hasFinished = data.status === 'ERROR' || 
                                        (data.result && ['WRONG', 'TIME_LIMIT_EXCEEDED', 'COMPILATION_ERROR', 'RUNTIME_ERROR'].includes(data.result.status)) ||
                                        (data.status === 'SUCCESS' && data.view_mode && data.view_mode !== 'correct' && data.view_mode !== 'compiling' && data.view_mode !== 'running') ||
                                        (data.status === 'SUCCESS' && data.sub_status !== undefined && data.sub_status !== 1 && data.sub_status !== 0); // 0 is usually pending
                    
                    if (isCorrect) {
                         console.log('[DSA Auto-Commit] GFG Submission Accepted! Sending to background...');
                         window.postMessage({
                             type: 'GFG_SUBMISSION_ACCEPTED',
                             payload: {
                                 ...pendingSubmission,
                                 runtime: (data.result ? data.result.time : data.time) || '',
                                 memory: (data.result ? data.result.memory : data.memory) || ''
                             }
                         }, '*');
                         pendingSubmission = null;
                    } else if (hasFinished) {
                         console.log('[DSA Auto-Commit] GFG Submission failed.');
                         pendingSubmission = null;
                    }
                }
            }).catch(e => {
            });
        }

        return response;
    };

    // --- XHR INTERCEPTOR (GeeksforGeeks) ---
    const originalXHR = window.XMLHttpRequest;
    let pendingGfgSubmission = null;

    window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        let method = '';
        let url = '';
        let requestBody = null;

        const originalOpen = xhr.open;
        xhr.open = function(m, u, ...rest) {
            method = m;
            url = u;
            return originalOpen.apply(xhr, [m, u, ...rest]);
        };

        const originalSend = xhr.send;
        xhr.send = function(b) {
            requestBody = b;
            
            xhr.addEventListener('load', function() {
                if (typeof url === 'string') {
                    // Intercept GFG Submit Request (to get code/lang)
                    if (url.includes('geeksforgeeks.org') && url.includes('/compile-and-submit')) {
                        try {
                            const bodyJson = JSON.parse(requestBody);
                            const match = url.match(/problems\/(.+?)\//);
                            if (match && bodyJson.code && bodyJson.language) {
                                pendingGfgSubmission = {
                                    platform: 'gfg',
                                    problemSlug: match[1],
                                    code: bodyJson.code,
                                    lang: bodyJson.language
                                };
                            }
                        } catch (e) {}
                    }
                    
                    // Intercept GFG Status Check (Polling)
                    if (url.includes('geeksforgeeks.org') && url.includes('/submission-status/') && pendingGfgSubmission) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            if (data.status === 'SUCCESS' && data.result && data.result.status === 'CORRECT') {
                                console.log('[DSA Auto-Commit] GFG Submission Accepted! Sending to background...');
                                window.postMessage({
                                    type: 'GFG_SUBMISSION_ACCEPTED',
                                    payload: {
                                        ...pendingGfgSubmission,
                                        runtime: data.result.time || '',
                                        memory: data.result.memory || ''
                                    }
                                }, '*');
                                pendingGfgSubmission = null;
                            } else if (data.status === 'SUCCESS' && data.result && data.result.status !== 'CORRECT') {
                                pendingGfgSubmission = null; // Failed submission
                            }
                        } catch(e) {}
                    }
                }
            });
            return originalSend.apply(xhr, [b]);
        };
        return xhr;
    };
})();
