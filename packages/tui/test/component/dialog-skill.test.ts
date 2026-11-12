import { describe, expect, test } from "bun:test"
import { filterSkills } from "../../src/component/dialog-skill"

type SkillOption = { title: string; description?: string }

// Titles are padded to a common width by the dialog, so the fixtures are padded too.
const skills: SkillOption[] = [
  { title: "pdf-extract   ", description: "Pull text out of PDF documents" },
  { title: "deploy-worker ", description: "Ship a service to production" },
  { title: "release-notes ", description: "Draft a changelog for the next release" },
]

const titles = (options: SkillOption[]) => options.map((option) => option.title.trim())

describe("dialog skill filter", () => {
  test("filters by skill name", () => {
    expect(titles(filterSkills(skills, "pdf"))).toEqual(["pdf-extract"])
  })

  test("matches skill names fuzzily and ignores case", () => {
    expect(titles(filterSkills(skills, "PDext"))).toEqual(["pdf-extract"])
  })

  test("filters by skill description", () => {
    expect(titles(filterSkills(skills, "production"))).toEqual(["deploy-worker"])
  })

  test("returns every skill that matches by name or description", () => {
    const options = [...skills, { title: "merge-docs    ", description: "Combine several PDF files into one" }]
    // Results are ranked by match quality, so only the set of matches is part of the contract.
    expect(titles(filterSkills(options, "pdf")).toSorted()).toEqual(["merge-docs", "pdf-extract"])
  })

  test("restores the full list for an empty query", () => {
    expect(filterSkills(skills, "")).toEqual(skills)
    expect(filterSkills(skills, "   ")).toEqual(skills)
  })

  test("returns nothing when no skill matches", () => {
    expect(filterSkills(skills, "zzzzq")).toEqual([])
  })

  test("tolerates skills without a description", () => {
    const options = [{ title: "scratchpad    " }, ...skills]
    expect(titles(filterSkills(options, "production"))).toEqual(["deploy-worker"])
    expect(titles(filterSkills(options, "scratch"))).toEqual(["scratchpad"])
  })

  // R3 acceptance criteria (revised in P4, see traceability/bbarin.md).
  test("ignores case and surrounding spaces, tolerates omitted letters, and rejects unrelated queries", () => {
    const options = [...skills, { title: "deploy-service", description: "Roll out a service" }]
    expect(filterSkills(options, "PDF")).toEqual(filterSkills(options, "pdf"))
    expect(filterSkills(options, "  pdf ")).toEqual(filterSkills(options, "pdf"))
    expect(titles(filterSkills(options, "depy"))).toContain("deploy-service")
    expect(filterSkills(options, "zzzzq")).toEqual([])
  })

  // R7 acceptance criteria (revised in P4, see traceability/bbarin.md).
  test("ranks name keywords, then description keywords, then name letters, then description letters", () => {
    const options = [
      { title: "handbook      ", description: "Draft employee guide" },
      { title: "doc-employer  ", description: "Templates for offer letters" },
      { title: "notes         ", description: "How to deploy safely" },
      { title: "deploy-service", description: "Ship a service to production" },
    ]
    expect(titles(filterSkills(options, "deploy"))).toEqual(["deploy-service", "notes", "doc-employer", "handbook"])
  })

  // Regression found by the R7 property: fuzzysort scored the short description above the
  // padded, longer name, so the description-only match came first.
  test("ranks a name keyword above a description keyword even when the name is long", () => {
    const options = [
      { title: "release-notes   ", description: "deploy" },
      { title: "auto-deploy-tool", description: "Ship a service to production" },
    ]
    expect(titles(filterSkills(options, "deploy"))).toEqual(["auto-deploy-tool", "release-notes"])
  })
})
