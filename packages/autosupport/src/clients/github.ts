// src/clients/github.ts

export type GitHubIssue = {
  number: number
  html_url: string
  title: string
}

export type GitHubPR = {
  number: number
  title: string
  body: string | null
  head: { ref: string; sha: string }
  labels: { name: string }[]
  html_url: string
}

export type GitHubPRFile = {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
}

export type GitHubReview = {
  id: number
  state: string
}

export type GitHubMergeResult = {
  merged: boolean
  sha: string
  message: string
}

export function createGitHubClient(config: { token: string; repo: string }) {
  const [owner, repoName] = config.repo.split('/')
  if (!owner || !repoName) {
    throw new Error("GITHUB_REPO inválido — use formato 'owner/repo'")
  }

  if (!config.token) {
    throw new Error('GITHUB_TOKEN não configurado')
  }

  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const base = `https://api.github.com/repos/${owner}/${repoName}`

  async function createIssue(
    title: string,
    body: string,
    labels: string[] = ['bug', 'support'],
  ): Promise<GitHubIssue> {
    const response = await fetch(`${base}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, body, labels }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub API error ${response.status}: ${text}`)
    }
    return response.json() as Promise<GitHubIssue>
  }

  async function getPullRequest(prNumber: number): Promise<GitHubPR> {
    const response = await fetch(`${base}/pulls/${prNumber}`, {
      method: 'GET',
      headers,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub API error ${response.status}: ${text}`)
    }
    return response.json() as Promise<GitHubPR>
  }

  async function getPullRequestFiles(prNumber: number): Promise<GitHubPRFile[]> {
    const response = await fetch(`${base}/pulls/${prNumber}/files`, {
      method: 'GET',
      headers,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub API error ${response.status}: ${text}`)
    }
    return response.json() as Promise<GitHubPRFile[]>
  }

  async function approvePullRequest(prNumber: number, comment: string): Promise<GitHubReview> {
    const response = await fetch(`${base}/pulls/${prNumber}/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event: 'APPROVE', body: comment }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub API error ${response.status}: ${text}`)
    }
    return response.json() as Promise<GitHubReview>
  }

  async function mergePullRequest(prNumber: number): Promise<GitHubMergeResult> {
    const response = await fetch(`${base}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ merge_method: 'squash' }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub API error ${response.status}: ${text}`)
    }
    return response.json() as Promise<GitHubMergeResult>
  }

  async function postPullRequestComment(prNumber: number, comment: string): Promise<GitHubReview> {
    const response = await fetch(`${base}/pulls/${prNumber}/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event: 'COMMENT', body: comment }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub API error ${response.status}: ${text}`)
    }
    return response.json() as Promise<GitHubReview>
  }

  async function createPullRequest(
    title: string,
    body: string,
    branch: string,
    baseBranch = 'main',
  ): Promise<{ number: number; html_url: string; title: string }> {
    const response = await fetch(`${base}/pulls`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, body, head: branch, base: baseBranch, draft: false }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub API error ${response.status}: ${text}`)
    }
    return response.json() as Promise<{ number: number; html_url: string; title: string }>
  }

  async function addLabelsToPR(prNumber: number, labels: string[]): Promise<{ name: string }[]> {
    const response = await fetch(`${base}/issues/${prNumber}/labels`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ labels }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub API error ${response.status}: ${text}`)
    }
    return response.json() as Promise<{ name: string }[]>
  }

  return {
    createIssue,
    getPullRequest,
    getPullRequestFiles,
    approvePullRequest,
    mergePullRequest,
    postPullRequestComment,
    createPullRequest,
    addLabelsToPR,
  }
}

export type GitHubClient = ReturnType<typeof createGitHubClient>
