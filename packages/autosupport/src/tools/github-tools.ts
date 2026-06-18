import type { GitHubClient } from '../clients/github.js'
import { toErrorMessage } from '../errors.js'
import type { ToolBundle, ToolDefinition } from '../types.js'

export type GithubToolsConfig = {
  client: GitHubClient
  autoLabel?: string // default 'support-auto'
}

export function createGithubTools(cfg: GithubToolsConfig): ToolBundle {
  if (!cfg.client) throw new Error('GitHub client não configurado')
  const autoLabel = cfg.autoLabel ?? 'support-auto'

  const definitions: ToolDefinition[] = [
    {
      name: 'create_github_issue',
      description: 'Cria issue no GitHub com diagnóstico.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título conciso do bug' },
          body: { type: 'string', description: 'Corpo do issue em Markdown' },
        },
        required: ['title', 'body'],
      },
    },
    {
      name: 'create_pr',
      description: `Cria PR e adiciona label "${autoLabel}".`,
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          branch: { type: 'string' },
        },
        required: ['title', 'body', 'branch'],
      },
    },
    {
      name: 'read_pr',
      description: 'Lê título, body, branch e labels do PR.',
      input_schema: {
        type: 'object',
        properties: { prNumber: { type: 'number' } },
        required: ['prNumber'],
      },
    },
    {
      name: 'read_pr_files',
      description: 'Lê arquivos modificados no PR com diffs.',
      input_schema: {
        type: 'object',
        properties: { prNumber: { type: 'number' } },
        required: ['prNumber'],
      },
    },
    {
      name: 'approve_pr',
      description: 'Aprova o PR.',
      input_schema: {
        type: 'object',
        properties: {
          prNumber: { type: 'number' },
          comment: { type: 'string' },
        },
        required: ['prNumber', 'comment'],
      },
    },
    {
      name: 'merge_pr',
      description: 'Squash merge do PR.',
      input_schema: {
        type: 'object',
        properties: { prNumber: { type: 'number' } },
        required: ['prNumber'],
      },
    },
    {
      name: 'post_review_comment',
      description: 'Posta comentário "needs human review" no PR.',
      input_schema: {
        type: 'object',
        properties: {
          prNumber: { type: 'number' },
          comment: { type: 'string' },
        },
        required: ['prNumber', 'comment'],
      },
    },
  ]

  async function execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      switch (name) {
        case 'create_github_issue': {
          const issue = await cfg.client.createIssue(input.title as string, input.body as string)
          return { issueNumber: issue.number, url: issue.html_url }
        }
        case 'create_pr': {
          const pr = await cfg.client.createPullRequest(
            input.title as string,
            input.body as string,
            input.branch as string
          )
          await cfg.client.addLabelsToPR(pr.number, [autoLabel])
          return { prNumber: pr.number, url: pr.html_url }
        }
        case 'read_pr': {
          const pr = await cfg.client.getPullRequest(input.prNumber as number)
          return {
            number: pr.number,
            title: pr.title,
            body: pr.body,
            branch: pr.head.ref,
            labels: pr.labels.map((l) => l.name),
          }
        }
        case 'read_pr_files': {
          const files = await cfg.client.getPullRequestFiles(input.prNumber as number)
          return {
            files: files.map((f) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch?.slice(0, 2000),
            })),
          }
        }
        case 'approve_pr': {
          const r = await cfg.client.approvePullRequest(
            input.prNumber as number,
            input.comment as string
          )
          return { approved: true, reviewId: r.id }
        }
        case 'merge_pr': {
          const r = await cfg.client.mergePullRequest(input.prNumber as number)
          return { merged: r.merged, sha: r.sha }
        }
        case 'post_review_comment': {
          const prefix = 'Este PR requer revisão humana: '
          const raw = input.comment as string
          const comment = raw.startsWith(prefix) ? raw : prefix + raw
          await cfg.client.postPullRequestComment(input.prNumber as number, comment)
          return { posted: true }
        }
        default:
          return { error: `Ferramenta desconhecida: ${name}` }
      }
    } catch (err) {
      console.error('[autosupport-github-tools]', err)
      return { error: toErrorMessage(err) }
    }
  }

  return { definitions, execute }
}
