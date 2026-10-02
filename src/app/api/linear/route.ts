import { NextResponse } from "next/server"
import { hasLinearKey, linearQuery } from "@/lib/linear"

export const dynamic = "force-dynamic"

export type LinearCard = {
  id: string
  identifier: string
  title: string
  url: string
  /** Linear's suggested git branch for the issue */
  branchName: string
  priority: number
  priorityLabel: string
  estimate: number | null
  updatedAt: string
  state: { name: string; type: string; color: string }
  team: { key: string }
  cycle: { number: number; startsAt: string; endsAt: string } | null
  labels: { nodes: { name: string; color: string }[] }
  slaStartedAt: string | null
  slaMediumRiskAt: string | null
  slaHighRiskAt: string | null
  slaBreachesAt: string | null
}

const CARD_FIELDS = `
  id identifier title url branchName priority priorityLabel estimate updatedAt
  state { name type color }
  team { key }
  cycle { number startsAt endsAt }
  labels { nodes { name color } }
  slaStartedAt slaMediumRiskAt slaHighRiskAt slaBreachesAt
`

/**
 * Everything assigned to me in the active cycle (done included, for the points summary)
 * except canceled, plus everything assigned to me sitting in triage.
 */
const QUERY = `
  query OpenCycleCards {
    viewer {
      cycle: assignedIssues(
        first: 250
        filter: {
          cycle: { isActive: { eq: true } }
          state: { type: { neq: "canceled" } }
        }
      ) {
        nodes { ${CARD_FIELDS} }
      }
      triage: assignedIssues(first: 250, filter: { state: { type: { eq: "triage" } } }) {
        nodes { ${CARD_FIELDS} }
      }
    }
  }
`

type Connection = { nodes: LinearCard[] }

export async function GET() {
  if (!hasLinearKey()) {
    return NextResponse.json({ error: "LINEAR_API_KEY is not set" }, { status: 501 })
  }
  try {
    const { viewer } = await linearQuery<{ viewer: { cycle: Connection; triage: Connection } }>(QUERY)
    const inCycle = new Set(viewer.cycle.nodes.map((i) => i.id))
    return NextResponse.json({
      issues: viewer.cycle.nodes,
      // triage cards already in the active cycle show up in the main list
      triage: viewer.triage.nodes.filter((i) => !inCycle.has(i.id)),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
