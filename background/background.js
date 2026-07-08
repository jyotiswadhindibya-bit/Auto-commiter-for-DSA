import { GitHubAPI } from './github-api.js';

console.log('[DSA Auto-Commit] Background Service Worker Loaded successfully!');

function getFileExtension(lang) {
    const extMap = {
        'cpp': 'cpp',
        'java': 'java',
        'python': 'py',
        'python3': 'py',
        'c': 'c',
        'csharp': 'cs',
        'javascript': 'js',
        'typescript': 'ts',
        'ruby': 'rb',
        'swift': 'swift',
        'golang': 'go',
        'scala': 'scala',
        'kotlin': 'kt',
        'rust': 'rs',
        'php': 'php'
    };
    return extMap[lang] || lang;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[DSA Auto-Commit] Background received message:', request);
    if (request.action === 'commitSolution') {
        const payload = request.data;
        
        chrome.storage.local.get(['githubPat', 'githubRepo'], async (result) => {
            if (!result.githubPat || !result.githubRepo) {
                console.warn('[DSA Auto-Commit] GitHub PAT or Repo not configured. Please set them in the popup.');
                return;
            }

            try {
                const api = new GitHubAPI(result.githubPat, result.githubRepo);
                
                const problemSlug = payload.problemSlug;
                const ext = getFileExtension(payload.lang);
                
                // Construct file paths based on requested folder structure
                const codePath = `${problemSlug}/Solution.${ext}`;
                const readmePath = `${problemSlug}/README.md`;
                
                // Format memory if it's raw bytes
                let memDisplay = payload.memory;
                if (typeof memDisplay === 'number') {
                    memDisplay = (memDisplay / 1000000).toFixed(2) + ' MB';
                }
                
                let beatsRuntime = payload.runtimePercentile ? `(Beats ${payload.runtimePercentile.toFixed(2)}%)` : '';
                let beatsMemory = payload.memoryPercentile ? `(Beats ${payload.memoryPercentile.toFixed(2)}%)` : '';

                const questionTitle = payload.questionTitle || payload.problemSlug;
                const difficulty = payload.difficulty || 'Unknown';
                const questionHtml = payload.questionContent || '';

                const readmeContent = `<h2><a href="https://leetcode.com/problems/${payload.problemSlug}">${questionTitle}</a></h2>
<h3>${difficulty}</h3>
<hr>
${questionHtml}
<hr>
<h3>Solution</h3>
<p><strong>Language:</strong> ${payload.lang}</p>
<p><strong>Runtime:</strong> ${payload.runtime || 'N/A'} ${beatsRuntime}</p>
<p><strong>Memory:</strong> ${memDisplay || 'N/A'} ${beatsMemory}</p>
`;

                const files = [
                    { path: codePath, content: payload.code },
                    { path: readmePath, content: readmeContent }
                ];

                const commitMsg = `Add solution for ${problemSlug} [${payload.lang}]`;
                
                console.log(`[DSA Auto-Commit] Committing ${problemSlug}...`);
                await api.commitFiles(commitMsg, files);
                console.log(`[DSA Auto-Commit] Successfully committed ${problemSlug} to GitHub.`);

            } catch (error) {
                console.error('[DSA Auto-Commit] Error during commit process:', error);
            }
        });
        
        return true; 
    }
});
