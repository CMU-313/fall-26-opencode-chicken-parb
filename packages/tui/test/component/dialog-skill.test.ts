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
})
