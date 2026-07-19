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

        chrome.storage.local.get(['githubPat', 'githubRepo', 'githubFolder'], async (result) => {
            if (!result.githubPat || !result.githubRepo) {
                console.warn('[DSA Auto-Commit] GitHub PAT or Repo not configured. Please set them in the popup.');
                sendResponse({ success: false, error: 'GitHub PAT or Repo not configured' });
                return;
            }

            try {
                const api = new GitHubAPI(result.githubPat, result.githubRepo);

                const problemSlug = payload.problemSlug;
                let filePath = `${problemSlug}.md`;

                if (result.githubFolder) {
                    const cleanFolder = result.githubFolder.replace(/^\/+|\/+$/g, '');
                    if (cleanFolder) {
                        filePath = `${cleanFolder}/${filePath}`;
                    }
                }

                const questionTitle = payload.questionTitle || payload.problemSlug;
                const difficulty = payload.difficulty || 'Unknown';
                const questionHtml = payload.questionContent || '';

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
                } else {
                    // Create new file from skeleton
                    finalContent = `<!-- problem:start -->

# [${questionTitle}](https://leetcode.com/problems/${problemSlug})

## Description

<!-- description:start -->

${questionHtml}

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
