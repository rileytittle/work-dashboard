import { hasLinearKey, linearQuery } from "@/lib/linear"
import type { DayData, DayIssue } from "../types"

type Node = {
  identifier: string
  title: string
  url: string
  estimate: number | null
  completedAt: string
  state: { name: string }
  project: { name: string } | null
}

/** Issues assigned to you that finished today, with their story points. */
export async function collectLinear(from: Date): Promise<NonNullable<DayData["linear"]>> {
  if (!hasLinearKey()) throw new Error("LINEAR_API_KEY is not set")

  // the stamp is generated here, never user input, so it is safe inline
  const query = `
    query DayDone {
      viewer {
        assignedIssues(
          first: 100
          filter: { completedAt: { gte: "${from.toISOString()}" } }
        ) {
          nodes {
            identifier title url estimate completedAt
            state { name }
            project { name }
          }
        }
      }
    }
  `

  const { viewer } = await linearQuery<{ viewer: { assignedIssues: { nodes: Node[] } } }>(query)
  const completed: DayIssue[] = viewer.assignedIssues.nodes.map((n) => ({
    identifier: n.identifier,
    title: n.title,
    url: n.url,
    estimate: n.estimate,
    completedAt: n.completedAt,
    state: n.state.name,
    project: n.project?.name ?? null,
  }))
  return { completed, points: completed.reduce((sum, i) => sum + (i.estimate ?? 0), 0) }
}
