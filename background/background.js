import { GitHubAPI } from './github-api.js';

console.log('[DSA Auto-Commit] Background Service Worker Loaded successfully!');

function getLanguageDisplayName(lang) {
    const map = {
        'cpp': 'C++', 'java': 'Java', 'python': 'Python', 'python3': 'Python3',
        'c': 'C', 'csharp': 'C#', 'javascript': 'JavaScript', 'typescript': 'TypeScript',
        'ruby': 'Ruby', 'swift': 'Swift', 'golang': 'Go', 'scala': 'Scala',
        'kotlin': 'Kotlin', 'rust': 'Rust', 'php': 'PHP'
    };
    return map[lang] || lang;
}

function getMarkdownCodeBlockLang(lang) {
    const map = {
        'cpp': 'cpp', 'java': 'java', 'python': 'python', 'python3': 'python',
        'c': 'c', 'csharp': 'cs', 'javascript': 'javascript', 'typescript': 'typescript',
        'ruby': 'ruby', 'swift': 'swift', 'golang': 'go', 'scala': 'scala',
        'kotlin': 'kotlin', 'rust': 'rust', 'php': 'php'
    };
    return map[lang] || lang;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[DSA Auto-Commit] Background received message:', request);
    if (request.action === 'commitSolution') {
        const payload = request.data;
        if (!payload || !payload.code) return;

        chrome.storage.local.get(['githubPat', 'githubRepo', 'githubFolder', 'gfgFolder'], async (result) => {
            if (!result.githubPat || !result.githubRepo) {
                console.error('[DSA Auto-Commit] Missing GitHub credentials. Please configure the extension.');
                sendResponse({ success: false, error: 'GitHub PAT or Repo not configured' });
                return;
            }

            try {
                const api = new GitHubAPI(result.githubPat, result.githubRepo);

                const problemSlug = payload.problemSlug;
                const questionTitle = payload.questionTitle || problemSlug;
                const difficulty = payload.difficulty || 'Unknown';
                const questionContent = payload.questionContent || '';
                
                let targetFolder = '';
                if (payload.platform === 'gfg') {
                    if (result.gfgFolder) {
                        targetFolder = result.gfgFolder.replace(/^\/+|\/+$/g, '') + '/';
                    }
                } else {
                    if (result.githubFolder) {
                        targetFolder = result.githubFolder.replace(/^\/+|\/+$/g, '') + '/';
                    }
                }
                
                const filePath = `${targetFolder}${problemSlug}.md`;

                const langDisplay = getLanguageDisplayName(payload.lang);
                const codeBlockLang = getMarkdownCodeBlockLang(payload.lang);

                const newCodeSection = `#### ${langDisplay}\n\n\`\`\`${codeBlockLang}\n${payload.code}\n\`\`\`\n`;

                let finalContent = '';

                const existingContent = await api.getFile(filePath);

                if (existingContent) {

                    const tabsStart = '<!-- tabs:start -->';
                    const tabsEnd = '<!-- tabs:end -->';

                    const startIndex = existingContent.indexOf(tabsStart);
                    const endIndex = existingContent.indexOf(tabsEnd);

                    if (startIndex !== -1 && endIndex !== -1) {
                        let tabsContent = existingContent.substring(startIndex + tabsStart.length, endIndex);

                        // Check if language already exists and replace it, otherwise append
                        const escapedLang = escapeRegExp(langDisplay);
                        const langRegex = new RegExp(`#### ${escapedLang}[\\s\\S]*?(?=#### |$)`);
                        if (langRegex.test(tabsContent)) {
                            tabsContent = tabsContent.replace(langRegex, newCodeSection + '\n');
                        } else {
                            tabsContent += '\n' + newCodeSection;
                        }

                        finalContent = existingContent.substring(0, startIndex + tabsStart.length)
                            + tabsContent
                            + existingContent.substring(endIndex);
                    } else {
                        // Append to the end if tabs block is missing for some reason
                        finalContent = existingContent + `\n${tabsStart}\n\n${newCodeSection}\n${tabsEnd}\n`;
                    }
                    
                    // Also update the description if it was previously missing or empty
                    const descStart = '<!-- description:start -->';
                    const descEnd = '<!-- description:end -->';
                    const dStartIdx = finalContent.indexOf(descStart);
                    const dEndIdx = finalContent.indexOf(descEnd);
                    
                    if (dStartIdx !== -1 && dEndIdx !== -1 && questionContent && questionContent.length > 50) {
                        finalContent = finalContent.substring(0, dStartIdx + descStart.length) + 
                                       '\n\n' + questionContent + '\n\n' + 
                                       finalContent.substring(dEndIdx);
                    }
                } else {
                    const titleUrl = payload.platform === 'gfg' 
                        ? `https://practice.geeksforgeeks.org/problems/${problemSlug}`
                        : `https://leetcode.com/problems/${problemSlug}`;

                    finalContent = `<!-- problem:start -->

# [${questionTitle}](${titleUrl})

## Description

<!-- description:start -->

${questionContent}

<!-- description:end -->

## Solutions

<!-- solution:start -->

<!-- tabs:start -->

${newCodeSection}
<!-- tabs:end -->

<!-- solution:end -->

<!-- problem:end -->
`;
                }

                const files = [
                    { path: filePath, content: finalContent }
                ];

                const commitMsg = `Add/Update solution for ${problemSlug} [${langDisplay}]`;

                console.log(`[DSA Auto-Commit] Committing ${filePath}...`);
                await api.commitFiles(commitMsg, files);
                console.log(`[DSA Auto-Commit] Successfully committed ${filePath} to GitHub.`);
                sendResponse({ success: true, message: `Successfully committed to ${filePath}` });

            } catch (error) {
                console.error('[DSA Auto-Commit] Error during commit process:', error);
                sendResponse({ success: false, error: error.toString() });
            }
        });

        return true;
    }
});
