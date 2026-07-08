document.addEventListener('DOMContentLoaded', () => {
    const patInput = document.getElementById('pat');
    const repoInput = document.getElementById('repo');
    const saveBtn = document.getElementById('save-btn');
    const statusMsg = document.getElementById('status-msg');

    // Load saved settings
    chrome.storage.local.get(['githubPat', 'githubRepo'], (result) => {
        if (result.githubPat) patInput.value = result.githubPat;
        if (result.githubRepo) repoInput.value = result.githubRepo;
    });

    saveBtn.addEventListener('click', () => {
        const pat = patInput.value.trim();
        const repo = repoInput.value.trim();

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
            githubRepo: repo
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
