class GitHubAPI {
    constructor(pat, repo) {
        this.pat = pat;
        this.repo = repo;
        this.baseUrl = `https://api.github.com/repos/${repo}`;
        this.headers = {
            'Authorization': `Bearer ${pat}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    }

    async request(method, endpoint, body = null) {
        const options = {
            method,
            headers: this.headers
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(`${this.baseUrl}${endpoint}`, options);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(`GitHub API Error (${response.status}): ${err.message}`);
        }
        return await response.json();
    }

    async getDefaultBranch() {
        const data = await this.request('GET', '');
        return data.default_branch;
    }

    async getLatestCommitSha(branch) {
        const data = await this.request('GET', `/git/ref/heads/${branch}`);
        return data.object.sha;
    }

    async getBaseTreeSha(commitSha) {
        const data = await this.request('GET', `/git/commits/${commitSha}`);
        return data.tree.sha;
    }

    async createBlob(content) {
        const data = await this.request('POST', '/git/blobs', {
            content: content,
            encoding: 'utf-8'
        });
        return data.sha;
    }

    async createTree(baseTreeSha, files) {
        const tree = files.map(file => ({
            path: file.path,
            mode: '100644', // regular file
            type: 'blob',
            sha: file.sha
        }));

        const data = await this.request('POST', '/git/trees', {
            base_tree: baseTreeSha,
            tree: tree
        });
        return data.sha;
    }

    async createCommit(message, treeSha, parentCommitSha) {
        const data = await this.request('POST', '/git/commits', {
            message: message,
            tree: treeSha,
            parents: [parentCommitSha]
        });
        return data.sha;
    }

    async updateBranchRef(branch, newCommitSha) {
        await this.request('PATCH', `/git/refs/heads/${branch}`, {
            sha: newCommitSha,
            force: false
        });
    }

    async commitFiles(message, files) {
        try {
            const branch = await this.getDefaultBranch();
            const latestCommitSha = await this.getLatestCommitSha(branch);
            const baseTreeSha = await this.getBaseTreeSha(latestCommitSha);
            
            const createdFiles = [];
            for (const file of files) {
                const blobSha = await this.createBlob(file.content);
                createdFiles.push({
                    path: file.path,
                    sha: blobSha
                });
            }

            const newTreeSha = await this.createTree(baseTreeSha, createdFiles);
            const newCommitSha = await this.createCommit(message, newTreeSha, latestCommitSha);
            await this.updateBranchRef(branch, newCommitSha);
            
            return true;
        } catch (error) {
            console.error('[DSA Auto-Commit] Failed to commit files:', error);
            throw error;
        }
    }
}

export { GitHubAPI };
