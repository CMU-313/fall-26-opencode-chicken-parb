import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { FastCheck } from "effect/testing"
import { filterSkills } from "../../src/component/dialog-skill"

// R7 property first written by opencode in P5 (the agent failure case in traceability/bbarin.md,
// transcript in mutants/bbarin/), then strengthened. opencode's version built exactly one fixed
// skill per tier from a single query term:
// - with one term, `some` term and `every` term are the same thing, so a tier check that tested
//   only some of the terms survived (H5, Stryker #22);
// - its name-keyword skill was always shorter than its description-keyword skill, so fuzzysort's
//   score alone put them in the right order even with the name-keyword tier removed (Stryker #17);
// - every skill had a description, so a missing one was never ranked (H6).
// Changes: one or two terms; one skill for every combination of where each term is placed, so
// skills mix strengths and fields; filler of random length around every field, so the order has
// to come from the tier and not from fuzzysort's length penalty; and skills that match only by
// name may have no description at all (R8). With several skills per tier, the assertion checks
// that every skill is returned and the tiers never decrease, instead of one exact order.

type SkillOption = { title: string; description?: string; tier: number }

// Each query term gets its own letters, so a term can only match where it was placed. Filler
// ("z", digits, "s") shares no letter with either alphabet, and "-" separates letters that must
// not be contiguous.
const ALPHABETS = ["abcde", "fghij"]
const word = (alphabet: string) =>
  FastCheck.array(FastCheck.constantFrom(...alphabet), { minLength: 2, maxLength: 4 }).map((letters) =>
    letters.join(""),
  )
const query = FastCheck.integer({ min: 1, max: 2 }).chain((count) =>
  FastCheck.tuple(...ALPHABETS.slice(0, count).map(word)),
)

// Where one query term is placed in one skill, and the R7 tier that the placements of all terms
// give the skill: (1) every term a keyword in the name; (2) every term a keyword, some in the
// description; (3) every term in the name, some only letter by letter; (4) the rest.
const SPOTS = ["name", "description", "name-letters", "description-letters"] as const
type Spot = (typeof SPOTS)[number]
const tierOf = (spots: Spot[]) => {
  if (spots.every((spot) => spot === "name")) return 1
  if (spots.every((spot) => spot === "name" || spot === "description")) return 2
  if (spots.every((spot) => spot.startsWith("name"))) return 3
  return 4
}

const filler = FastCheck.string({ unit: FastCheck.constantFrom("z", "0", "1"), maxLength: 12 })

const skillFor = (terms: string[], spots: Spot[]) =>
  FastCheck.tuple(filler, filler, filler, filler, FastCheck.constantFrom("missing", "empty", "filler")).map(
    ([beforeName, afterName, beforeDescription, afterDescription, noDescription]): SkillOption => {
      const pieces = (field: "name" | "description") =>
        terms.flatMap((term, i) =>
          spots[i] === field ? [term] : spots[i] === `${field}-letters` ? [term.split("").join("-")] : [],
        )
      const title = ["s", beforeName, ...pieces("name"), afterName].join("z")
      const tier = tierOf(spots)
      if (pieces("description").length)
        return { title, description: [beforeDescription, ...pieces("description"), afterDescription].join(" "), tier }
      if (noDescription === "missing") return { title, tier }
      return { title, description: noDescription === "empty" ? "" : `z${beforeDescription}`, tier }
    },
  )

// One skill for every combination of one spot per term (4 skills for one term, 16 for two).
const corpus = query.chain((terms) => {
  const combos = terms.reduce<Spot[][]>((all) => all.flatMap((combo) => SPOTS.map((spot) => [...combo, spot])), [[]])
  return FastCheck.record({
    terms: FastCheck.constant(terms),
    skills: FastCheck.tuple(...combos.map((spots) => skillFor(terms, spots))),
    keys: FastCheck.array(FastCheck.integer(), { minLength: combos.length, maxLength: combos.length }),
  })
})

describe("dialog skill filter (R7 property)", () => {
  // Fixed seed, as in dialog-skill.property.test.ts, so mutation results are reproducible.
  const previous = FastCheck.readConfigureGlobal()
  beforeAll(() => FastCheck.configureGlobal({ ...previous, seed: 17313 }))
  afterAll(() => FastCheck.configureGlobal(previous))

  test("orders keyword matches before character matches, and name before description", () => {
    FastCheck.assert(
      FastCheck.property(corpus, (input) => {
        // Random sort keys put the skills in a different input order on each run, so a filter
        // that merely preserved input order would fail.
        const shuffled = input.skills
          .map((skill, index) => ({ skill, key: input.keys[index] }))
          .sort((a, b) => a.key - b.key)
          .map((entry) => entry.skill)

        const tiers = filterSkills(shuffled, input.terms.join(" ")).map((skill) => skill.tier)

        expect(tiers).toHaveLength(shuffled.length)
        expect(tiers).toEqual(tiers.toSorted((a, b) => a - b))
      }),
      { numRuns: 300 },
    )
  })
})
