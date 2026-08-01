document.addEventListener('DOMContentLoaded', () => {
    const patInput = document.getElementById('pat');
    const repoInput = document.getElementById('repo');
    const folderInput = document.getElementById('folder');
    const gfgFolderInput = document.getElementById('gfg-folder');
    const saveBtn = document.getElementById('save-btn');
    const statusMsg = document.getElementById('status-msg');

    chrome.storage.local.get(['githubPat', 'githubRepo', 'githubFolder', 'gfgFolder'], (result) => {
        if (result.githubPat) patInput.value = result.githubPat;
        if (result.githubRepo) repoInput.value = result.githubRepo;
        if (result.githubFolder) folderInput.value = result.githubFolder;
        if (result.gfgFolder) gfgFolderInput.value = result.gfgFolder;
    });

    saveBtn.addEventListener('click', () => {
        const pat = patInput.value.trim();
        let repo = repoInput.value.trim();
        let folder = folderInput.value.trim();
        let gfgFolder = gfgFolderInput.value.trim();

        if (repo.includes('github.com') || repo.includes('tree/')) {
            try {
                let urlStr = repo;
                if (!urlStr.startsWith('http')) urlStr = 'https://' + urlStr;
                const url = new URL(urlStr);
                const pathParts = url.pathname.split('/').filter(p => p);
                
                if (pathParts.length >= 2) {
                    repo = `${pathParts[0]}/${pathParts[1]}`;
                    
                    if (pathParts.length > 4 && pathParts[2] === 'tree') {
                        folder = pathParts.slice(4).join('/');
                        folderInput.value = folder;
                    }
                }
            } catch (e) {
            }
        }
        
        repoInput.value = repo;

        if (!pat || !repo) {
            showStatus('Please fill in both fields.', 'error');
            return;
        }

        if (!repo.includes('/')) {
            showStatus('Repository must be in username/repo format.', 'error');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        chrome.storage.local.set({
            githubPat: pat,
            githubRepo: repo,
            githubFolder: folder,
            gfgFolder: gfgFolder
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
