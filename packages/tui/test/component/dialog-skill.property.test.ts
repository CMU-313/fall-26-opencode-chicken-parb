import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { FastCheck } from "effect/testing"
import { filterSkills } from "../../src/component/dialog-skill"

// Property-based tests for the Skill Picker search (P4A). Requirement IDs and wording match
// traceability/bbarin.md. Every property runs against the production `filterSkills`, the
// function the dialog calls on every keystroke.

// Fixed fast-check seed (P5 mutation testing): every run generates the same cases, so whether a
// mutant is killed is reproducible and Stryker judges every mutant against one input set.
const SEED = 17313

type Skill = { name: string; description?: string }
type Description = { description?: string }

const LOWER = "abcdefghijklmnopqrstuvwxyz"
const DIGITS = "0123456789"

// The dialog pads every title to the longest skill name before filtering (dialog-skill.tsx), so
// the properties feed `filterSkills` the same shape. `name` rides along to identify results.
function toOptions<T extends Skill>(skills: T[]) {
  const width = Math.max(0, ...skills.map((skill) => skill.name.length))
  return skills.map((skill) => ({ ...skill, title: skill.name.padEnd(width) }))
}

const names = (options: Skill[]) => options.map((option) => option.name)

// ---------------------------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------------------------

const charOf = (alphabet: string) => FastCheck.constantFrom(...alphabet)
const wordOf = (alphabet: string, minLength: number, maxLength: number) =>
  FastCheck.string({ unit: charOf(alphabet), minLength, maxLength })

// Words that recur across real skills (the P3 interviews' examples). Mixing them with random
// words makes skills share vocabulary, so one query often hits several skills through different
// fields: the ambiguous cases search has to get right.
const VOCABULARY = ["pdf", "deploy", "service", "release", "notes", "extract", "docs", "merge", "review", "worker"]
const tokenOf = (alphabet: string) =>
  alphabet === LOWER + DIGITS
    ? FastCheck.oneof(FastCheck.constantFrom(...VOCABULARY), wordOf(alphabet, 2, 7))
    : wordOf(alphabet, 2, 7)

// Skill ids are kebab-case (pdf-extract, deploy-service). Hyphens matter: they are word
// boundaries for fuzzy scoring, and padding to a common width adds trailing spaces.
const nameOf = (alphabet: string) =>
  FastCheck.array(tokenOf(alphabet), { minLength: 1, maxLength: 3 }).map((parts) => parts.join("-"))

// Descriptions are short mixed-case prose with punctuation, like SKILL.md front matter.
// Upper-case letters exercise the case-insensitive policy from the skill side.
const proseOf = (alphabet: string) =>
  FastCheck.array(
    FastCheck.tuple(FastCheck.mixedCase(tokenOf(alphabet)), FastCheck.constantFrom("", "", "", ",", ".", ":")),
    { minLength: 1, maxLength: 7 },
  ).map((words) => words.map((word) => word.join("")).join(" "))

// Most skills have a description; some have none at all or an empty one (R8's boundary).
const descriptionOf = (alphabet: string) =>
  FastCheck.oneof(
    { weight: 6, arbitrary: proseOf(alphabet).map((description): Description => ({ description })) },
    { weight: 1, arbitrary: FastCheck.constant<Description>({}) },
    { weight: 1, arbitrary: FastCheck.constant<Description>({ description: "" }) },
  )

const skillOf = (alphabet: string) =>
  FastCheck.tuple(nameOf(alphabet), descriptionOf(alphabet)).map(
    ([name, description]): Skill => ({
      name,
      ...description,
    }),
  )

// Skills in an arbitrary load order with unique names, so "which skill came back" is unambiguous.
const corpusOf = (alphabet = LOWER + DIGITS, minLength = 1, maxLength = 8) =>
  FastCheck.uniqueArray(skillOf(alphabet), { minLength, maxLength, selector: (skill) => skill.name })

const spaces = (maxLength: number) => FastCheck.string({ unit: FastCheck.constant(" "), maxLength })

// The non-blank names and descriptions of a corpus: the text a query can be copied from.
const textsOf = (skills: Skill[]) =>
  skills.flatMap((skill) => [skill.name, skill.description ?? ""]).filter((text) => text.trim())

// Queries a user actually types against these skills (interviews C-5, C-6, O-5):
// - a shortened form: characters picked in order from a real name/description with others
//   left out ("depy" for "deploy-service");
// - a near miss: that shortened form plus one stray letter, which usually stops matching;
// - an unrelated word;
// - two shortened forms separated by extra spaces;
// - one shortened form typed twice ("pdf PDF"): after random casing the copies can differ only
//   by case, the boundary where a case-insensitive search must still treat them as one word;
// - initials ("d s" for deploy-service): one-letter terms match many skills at once, so they
//   stress how the many results are ordered.
// Each is then typed in random case with stray surrounding spaces.
function queryFor(skills: Skill[]) {
  const shortened = FastCheck.constantFrom(...textsOf(skills))
    .chain((text) => FastCheck.subarray([...text], { minLength: 1, maxLength: Math.min(text.length, 10) }))
    .map((chars) => chars.join(""))
  const nearMiss = shortened.chain((query) =>
    FastCheck.tuple(FastCheck.integer({ min: 0, max: query.length }), charOf(LOWER)).map(
      ([at, extra]) => query.slice(0, at) + extra + query.slice(at),
    ),
  )
  const unrelated = wordOf(LOWER + DIGITS, 1, 6)
  const twoTerms = FastCheck.tuple(shortened, shortened, FastCheck.integer({ min: 1, max: 3 })).map(
    ([first, second, gap]) => first + " ".repeat(gap) + second,
  )
  const repeated = shortened.filter((query) => !query.includes(" ")).map((query) => `${query} ${query}`)
  const initials = FastCheck.array(
    FastCheck.constantFrom(...textsOf(skills)).chain((text) => FastCheck.constantFrom(...text.replaceAll(" ", ""))),
    { minLength: 2, maxLength: 3 },
  ).map((letters) => letters.join(" "))
  return FastCheck.oneof(shortened, shortened, nearMiss, unrelated, twoTerms, repeated, initials)
    .chain((query) =>
      FastCheck.tuple(spaces(2), FastCheck.mixedCase(FastCheck.constant(query)), spaces(2)).map((typed) =>
        typed.join(""),
      ),
    )
    .filter((query) => query.trim() !== "")
}

const corpusWithQuery = () =>
  corpusOf().chain((skills) => FastCheck.record({ skills: FastCheck.constant(skills), query: queryFor(skills) }))

// ---------------------------------------------------------------------------------------------
// Independent model of the revised R3 matching rule: a literal transcription of the requirement
// (per space-separated term, characters in order, name OR description). It shares nothing with
// fuzzysort's scoring, bit-flag pre-filter or backtracking.
// ---------------------------------------------------------------------------------------------

const inOrder = (term: string, text: string) =>
  [...text].reduce((matched, char) => (term[matched] === char ? matched + 1 : matched), 0) === term.length

const modelMatches = (option: { title: string; description?: string }, query: string) =>
  query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every(
      (term) => inOrder(term, option.title.toLowerCase()) || inOrder(term, (option.description ?? "").toLowerCase()),
    )

describe("dialog skill filter properties", () => {
  // Scoped to this file: bun runs every test file in one process, so restore the global config.
  const previous = FastCheck.readConfigureGlobal()
  beforeAll(() => FastCheck.configureGlobal({ ...previous, seed: SEED }))
  afterAll(() => FastCheck.configureGlobal(previous))

  // R2: A skill is discoverable when the query matches either its name/title or its description.
  // Kind: invariant
  // Generator rationale: arbitrary corpora with shared vocabulary, and the query is a slice copied
  // out of one skill's name or its description (sometimes spanning a space, so it becomes two
  // terms). Every skill whose name or description contains that slice is a match in the plainest
  // sense, wherever it sits in the corpus, so none of them may be missing from the results.
  test("R2: every skill whose name or description contains the query is returned", () => {
    const sliceOf = (text: string) =>
      FastCheck.integer({ min: 0, max: text.length - 1 }).chain((start) =>
        FastCheck.integer({ min: start + 1, max: Math.min(text.length, start + 8) }).map((end) =>
          text.slice(start, end),
        ),
      )
    const sliceQuery = corpusOf().chain((skills) =>
      FastCheck.record({
        skills: FastCheck.constant(skills),
        query: FastCheck.constantFrom(...textsOf(skills))
          .chain(sliceOf)
          .filter((query) => query.trim() !== ""),
      }),
    )

    FastCheck.assert(
      FastCheck.property(sliceQuery, (input) => {
        const options = toOptions(input.skills)
        const needle = input.query.trim().toLowerCase()
        const containing = options.filter(
          (option) =>
            option.title.toLowerCase().includes(needle) || (option.description ?? "").toLowerCase().includes(needle),
        )
        expect(containing.length).toBeGreaterThan(0)
        expect(names(filterSkills(options, input.query))).toEqual(expect.arrayContaining(names(containing)))
      }),
      { numRuns: 300 },
    )
  })

  // R2: A skill is discoverable when the query matches either its name/title or its description.
  // Kind: invariant
  // Generator rationale: the query's letters are removed from the alphabet used for every other
  // piece of text. The description-only skill therefore has a name sharing no letter with the
  // query (it cannot match by name, even fuzzily) and carries the query only inside its
  // description; decoys share no letter with the query at all. This deliberately reaches the case
  // a name-only search would miss, next to a name-only skill that has no description.
  test("R2: a skill matching only through its description is found next to name matches", () => {
    const descriptionOnly = wordOf(LOWER, 2, 6).chain((query) => {
      const filler = [...(LOWER + DIGITS)].filter((char) => !query.includes(char)).join("")
      return FastCheck.record({
        query: FastCheck.constant(query),
        descriptionHit: FastCheck.record({
          name: nameOf(filler),
          words: FastCheck.array(FastCheck.mixedCase(tokenOf(filler)), { maxLength: 6 }),
          at: FastCheck.nat(),
        }).map((hit) => ({
          name: hit.name,
          description: hit.words.toSpliced(hit.at % (hit.words.length + 1), 0, query).join(" "),
        })),
        nameHit: nameOf(filler).map((name) => ({ name: `${name}-${query}` })),
        decoys: corpusOf(filler, 0, 4),
      })
    })

    FastCheck.assert(
      FastCheck.property(descriptionOnly, (input) => {
        const decoys = input.decoys.filter((decoy) => decoy.name !== input.descriptionHit.name)
        const options = toOptions([...decoys, input.descriptionHit, input.nameHit])
        expect(names(filterSkills(options, input.query)).toSorted()).toEqual(
          [input.descriptionHit.name, input.nameHit.name].toSorted(),
        )
      }),
      { numRuns: 300 },
    )
  })

  // R3 (revised): Search uses one case-insensitive policy and ignores leading, trailing and
  // repeated spaces, so letter case and spacing never change the results or their order. The
  // query is split into space-separated terms; a skill is returned exactly when every term's
  // characters appear in order (contiguously, or with characters omitted between them) in the
  // skill's name/title or in its description. A skill for which some term's characters do not
  // appear in order in either field is unrelated and is never returned.
  // Kind: model/oracle
  // Generator rationale: queryFor() produces shortened forms (characters omitted), near misses
  // (one stray letter added), unrelated words, two-term and repeated-term queries, all in random
  // case with stray spaces, over corpora with shared vocabulary. That mix lands on both sides of
  // the matching boundary for most skills. The oracle `modelMatches` is a literal reading of the
  // requirement, independent of fuzzysort; only the inclusion set is compared (order is R7).
  test("R3: the returned skills are exactly those whose name or description contains every term in order", () => {
    FastCheck.assert(
      FastCheck.property(corpusWithQuery(), (input) => {
        const options = toOptions(input.skills)
        const expected = names(options.filter((option) => modelMatches(option, input.query))).toSorted()
        expect(names(filterSkills(options, input.query)).toSorted()).toEqual(expected)
      }),
      { numRuns: 1000 },
    )
  })

  // R3 (revised): Search uses one case-insensitive policy and ignores leading, trailing and
  // repeated spaces, so letter case and spacing never change the results or their order. The
  // query is split into space-separated terms; a skill is returned exactly when every term's
  // characters appear in order (contiguously, or with characters omitted between them) in the
  // skill's name/title or in its description. A skill for which some term's characters do not
  // appear in order in either field is unrelated and is never returned.
  // Kind: metamorphic
  // Generator rationale: the same realistic queries, re-typed with a different random case, extra
  // spaces between terms and stray spaces around the query. These are exactly the variations the
  // interviews said must not matter (C-5, C-6, O-5, S-3), so the visible list must be identical:
  // same skills in the same order. Repeated terms ("pdf PDF") reach the one place fuzzysort's own
  // case handling differs (it de-duplicates words before lower-casing them).
  test("R3: changing letter case or adding spaces leaves the results and their order unchanged", () => {
    const variant = corpusWithQuery().chain((input) =>
      FastCheck.record({
        skills: FastCheck.constant(input.skills),
        query: FastCheck.constant(input.query),
        retyped: FastCheck.tuple(
          spaces(3),
          FastCheck.mixedCase(FastCheck.constant(input.query)),
          FastCheck.integer({ min: 1, max: 3 }),
          spaces(3),
        ).map(([lead, recased, gap, trail]) => lead + recased.replace(/ +/g, (run) => run + " ".repeat(gap)) + trail),
      }),
    )

    FastCheck.assert(
      FastCheck.property(variant, (input) => {
        const options = toOptions(input.skills)
        expect(names(filterSkills(options, input.retyped))).toEqual(names(filterSkills(options, input.query)))
      }),
      { numRuns: 1000 },
    )
  })

  // R3 (revised): Search uses one case-insensitive policy and ignores leading, trailing and
  // repeated spaces, so letter case and spacing never change the results or their order. The
  // query is split into space-separated terms; a skill is returned exactly when every term's
  // characters appear in order (contiguously, or with characters omitted between them) in the
  // skill's name/title or in its description. A skill for which some term's characters do not
  // appear in order in either field is unrelated and is never returned.
  // Kind: metamorphic
  // Generator rationale: start from a realistic query and leave out one or more of its non-space
  // characters (spaces separate terms; they are not characters of a term). Leaving characters
  // out is the "missing letter / shortened form" the interviews ask to tolerate, so it may only
  // widen the results: every skill found for the full query is still found.
  test("R3: omitting characters from a query never drops a skill that matched before", () => {
    const shortenedQuery = corpusWithQuery().chain((input) => {
      const letters = [...input.query].flatMap((char, index) => (char === " " ? [] : [index]))
      if (letters.length < 2) return FastCheck.constant({ ...input, shorter: input.query })
      return FastCheck.subarray(letters, { minLength: 1, maxLength: letters.length - 1 }).map((dropped) => ({
        ...input,
        shorter: [...input.query].filter((_, index) => !dropped.includes(index)).join(""),
      }))
    })

    FastCheck.assert(
      FastCheck.property(shortenedQuery, (input) => {
        const options = toOptions(input.skills)
        expect(names(filterSkills(options, input.shorter))).toEqual(
          expect.arrayContaining(names(filterSkills(options, input.query))),
        )
      }),
      { numRuns: 1000 },
    )
  })

  // R4: An empty or whitespace-only query restores the complete skill list in the original
  // no-query ordering and preserves previous picker behavior.
  // Kind: round-trip
  // Generator rationale: corpora in arbitrary load order (never sorted, so restoring "some" order
  // cannot pass by accident), a sequence of one to four realistic edits that narrow or change the
  // list, then a clear to "" or to only spaces/tabs. Edit -> clear must return to the starting
  // list: every loaded skill, the same objects, in load order, with the loaded list unmutated.
  test("R4: editing the query and then clearing it restores the original list and order", () => {
    const session = corpusOf(LOWER + DIGITS, 1, 10).chain((skills) =>
      FastCheck.record({
        skills: FastCheck.constant(skills),
        edits: FastCheck.array(queryFor(skills), { minLength: 1, maxLength: 4 }),
        cleared: FastCheck.oneof(
          FastCheck.constant(""),
          FastCheck.string({ unit: FastCheck.constantFrom(" ", "\t"), minLength: 1, maxLength: 5 }),
        ),
      }),
    )

    FastCheck.assert(
      FastCheck.property(session, (input) => {
        const options = toOptions(input.skills)
        const loaded = structuredClone(options)
        const initial = filterSkills(options, "")
        expect(initial).toEqual(loaded)

        input.edits.forEach((query) => filterSkills(options, query))
        const restored = filterSkills(options, input.cleared)

        expect(restored).toHaveLength(options.length)
        restored.forEach((option, index) => expect(option).toBe(initial[index]))
        expect(options).toEqual(loaded)
      }),
      { numRuns: 300 },
    )
  })

  // R7 (revised): When multiple skills match, results are ordered by match strength first and
  // field second: (1) every query term appears contiguously (keyword-level) in the name/title;
  // (2) otherwise, every term appears contiguously in the name/title or the description;
  // (3) otherwise, every term's characters appear in order (character-level fuzzy) in the
  // name/title; (4) all other matches, i.e. character-level matches that rely on the description.
  // Kind: invariant
  // Generator rationale: one or two query terms (2-5 letters, neither contained in the other) and
  // a filler alphabet with none of the query's letters. Each skill is built to sit in exactly one
  // tier: (1) the terms inside the name; (2) the terms only in the description, or for two terms
  // one in the name and one in the description; (3) the terms scattered through the name with
  // filler between every letter ("depy" -> "d3e7p0y"), so they never appear contiguously; (4) the
  // same scattering in the description only. Decoys are pure filler. Skills are shuffled, so load
  // order cannot produce the ranking. Each skill's tier is known from how it was built; the test
  // never re-derives it with the production rules.
  test("R7: keyword matches outrank character-level matches, and name matches outrank description matches", () => {
    const ranking = FastCheck.integer({ min: 1, max: 2 })
      .chain((count) =>
        FastCheck.uniqueArray(wordOf(LOWER, 2, 5), { minLength: count, maxLength: count }).filter((terms) =>
          terms.every((term, i) => terms.every((other, j) => i === j || !other.includes(term))),
        ),
      )
      .chain((terms) => {
        const used = new Set(terms.join(""))
        const filler = [...(LOWER + DIGITS)].filter((char) => !used.has(char)).join("")
        const fill = wordOf(filler, 1, 5)
        const scattered = FastCheck.tuple(
          ...terms.map((term) =>
            FastCheck.array(fill, { minLength: term.length - 1, maxLength: term.length - 1 }).map((gaps) =>
              [...term].map((char, i) => (i === 0 ? char : gaps[i - 1] + char)).join(""),
            ),
          ),
        )
        const prose = FastCheck.array(fill, { maxLength: 4 })
        // Places `pieces` among filler words, keeping the pieces in their given relative order.
        const among = (pieces: string[], separator: string) =>
          FastCheck.tuple(prose, FastCheck.mixedCase(FastCheck.constant(pieces.join(separator))), prose).map(
            ([before, core, after]) =>
              [...before, ...(pieces.length ? core.split(separator) : []), ...after].join(separator),
          )
        const tier = (rank: number, skill: FastCheck.Arbitrary<Skill>) =>
          FastCheck.array(
            skill.map((built) => ({ ...built, rank })),
            { minLength: 1, maxLength: 2 },
          )
        const descriptionKeyword = FastCheck.record({ name: among([], "-"), description: among(terms, " ") })

        return FastCheck.tuple(
          tier(1, FastCheck.record({ name: among(terms, "-"), description: among([], " ") })),
          tier(
            2,
            terms.length === 2
              ? FastCheck.oneof(
                  descriptionKeyword,
                  FastCheck.record({ name: among([terms[0]], "-"), description: among([terms[1]], " ") }),
                )
              : descriptionKeyword,
          ),
          tier(
            3,
            FastCheck.record({ name: scattered.chain((parts) => among(parts, "-")), description: among([], " ") }),
          ),
          tier(
            4,
            FastCheck.record({ name: among([], "-"), description: scattered.chain((parts) => among(parts, " ")) }),
          ),
          FastCheck.array(
            FastCheck.record({ name: among([], "-"), description: among([], " "), rank: FastCheck.constant(0) }),
            {
              maxLength: 3,
            },
          ),
        ).chain((groups) => {
          // Numeric suffixes keep names unique; digits are filler, so they never create a match.
          const built = groups.flat().map((skill, index) => ({ ...skill, name: `${skill.name || filler[0]}-${index}` }))
          return FastCheck.shuffledSubarray(built, { minLength: built.length, maxLength: built.length }).map(
            (skills) => ({ query: terms.join(" "), skills }),
          )
        })
      })

    FastCheck.assert(
      FastCheck.property(ranking, (input) => {
        const ranks = filterSkills(toOptions(input.skills), input.query).map((option) => option.rank)
        expect(ranks).not.toContain(0)
        expect(ranks).toHaveLength(input.skills.filter((skill) => skill.rank > 0).length)
        expect(ranks).toEqual(ranks.toSorted((a, b) => a - b))
      }),
      { numRuns: 300 },
    )
  })

  // R8: A skill with a missing or empty description must not cause filtering to fail and must
  // remain searchable by name/title.
  // Kind: invariant
  // Generator rationale: one to three skills whose description is absent, explicitly undefined,
  // empty, or whitespace-only (every way the SDK's optional `description` can arrive empty),
  // shuffled into a corpus that also has normal descriptions. The query is a shortened form of
  // one description-less skill's name in random case, so only its name can make it match. A
  // second realistic query over the same corpus checks filtering never throws, whatever it hits.
  test("R8: skills without a description never break filtering and stay findable by name", () => {
    const missing = FastCheck.constantFrom<Description>(
      {},
      { description: undefined },
      { description: "" },
      { description: "   " },
      { description: "\t" },
    )
    const withoutDescriptions = FastCheck.record({
      bare: FastCheck.uniqueArray(
        FastCheck.tuple(nameOf(LOWER + DIGITS), missing).map(
          ([name, description]): Skill => ({ name, ...description }),
        ),
        { minLength: 1, maxLength: 3, selector: (skill) => skill.name },
      ),
      others: corpusOf(LOWER + DIGITS, 0, 6),
    })
      .chain((input) => {
        const taken = new Set(names(input.bare))
        const skills = [...input.bare, ...input.others.filter((skill) => !taken.has(skill.name))]
        return FastCheck.record({
          skills: FastCheck.shuffledSubarray(skills, { minLength: skills.length, maxLength: skills.length }),
          target: FastCheck.constantFrom(...input.bare),
          other: queryFor(skills),
        })
      })
      .chain((input) =>
        FastCheck.subarray([...input.target.name], { minLength: 1 })
          .chain((chars) => FastCheck.mixedCase(FastCheck.constant(chars.join(""))))
          .map((query) => ({ ...input, query })),
      )

    FastCheck.assert(
      FastCheck.property(withoutDescriptions, (input) => {
        const options = toOptions(input.skills)
        expect(() => filterSkills(options, input.query)).not.toThrow()
        expect(() => filterSkills(options, input.other)).not.toThrow()
        const found = filterSkills(options, input.query)
        expect(names(found)).toContain(input.target.name)
        found.forEach((option) => expect(options).toContain(option))
      }),
      { numRuns: 300 },
    )
  })
})
