document.addEventListener('DOMContentLoaded', () => {
    const patInput = document.getElementById('pat');
    const repoInput = document.getElementById('repo');
    const folderInput = document.getElementById('folder');
    const saveBtn = document.getElementById('save-btn');
    const statusMsg = document.getElementById('status-msg');

    // Load saved settings
    chrome.storage.local.get(['githubPat', 'githubRepo', 'githubFolder'], (result) => {
        if (result.githubPat) patInput.value = result.githubPat;
        if (result.githubRepo) repoInput.value = result.githubRepo;
        if (result.githubFolder) folderInput.value = result.githubFolder;
    });

    saveBtn.addEventListener('click', () => {
        const pat = patInput.value.trim();
        let repo = repoInput.value.trim();
        let folder = folderInput.value.trim();

        // Auto-parse full GitHub URLs if pasted
        if (repo.includes('github.com') || repo.includes('tree/')) {
            try {
                let urlStr = repo;
                if (!urlStr.startsWith('http')) urlStr = 'https://' + urlStr;
                const url = new URL(urlStr);
                const pathParts = url.pathname.split('/').filter(p => p);
                
                if (pathParts.length >= 2) {
                    repo = `${pathParts[0]}/${pathParts[1]}`;
                    
                    // If they pasted a tree URL, extract the folder automatically
                    if (pathParts.length > 4 && pathParts[2] === 'tree') {
                        folder = pathParts.slice(4).join('/');
                        folderInput.value = folder; // Update UI to show the parsed folder
                    }
                }
            } catch (e) {
                // ignore
            }
        }
        
        // Clean up the UI
        repoInput.value = repo;

        if (!pat || !repo) {
            showStatus('Please fill in both fields.', 'error');
            return;
        }

        if (!repo.includes('/')) {
            showStatus('Repository must be in username/repo format.', 'error');
            return;
        }

        // Disable button while saving/validating
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        // Save to storage
        chrome.storage.local.set({
            githubPat: pat,
            githubRepo: repo,
            githubFolder: folder
        }, () => {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Settings';
            showStatus('Settings saved successfully!', 'success');
            
            // Clear message after 3 seconds
            setTimeout(() => {
                statusMsg.textContent = '';
                statusMsg.className = '';
            }, 3000);
        });
    });

    function showStatus(msg, type) {
        statusMsg.textContent = msg;
        statusMsg.className = type;
    }
});
