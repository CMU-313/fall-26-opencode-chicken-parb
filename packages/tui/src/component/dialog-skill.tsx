import { TextAttributes } from "@opentui/core"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { createResource, createMemo, createSignal } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useTheme } from "../context/theme"
import { errorMessage } from "../util/error"
import * as fuzzysort from "fuzzysort"

export type DialogSkillProps = {
  onSelect: (skill: string) => void
}

export function DialogSkill(props: DialogSkillProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  const { theme } = useTheme()
  dialog.setSize("large")

  const [loadError, setLoadError] = createSignal<unknown>()
  const [query, setQuery] = createSignal("")

  const [skills] = createResource(() =>
    sdk.client.app
      .skills({}, { throwOnError: true })
      .then((result) => result.data ?? [])
      // Catch so the rejected resource never reaches the memo below: reading
      // skills() in an errored state re-throws and tears down the dialog.
      .catch((error) => {
        setLoadError(error)
        return undefined
      }),
  )

  const showError = createMemo(() => Boolean(loadError()))

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    if (showError()) return []
    const list = skills() ?? []
    const maxWidth = Math.max(0, ...list.map((s) => s.name.length))
    return filterSkills(
      list.map((skill) => ({
        title: skill.name.padEnd(maxWidth),
        description: skill.description?.replace(/\s+/g, " ").trim(),
        value: skill.name,
        category: "Skills",
        onSelect: () => {
          props.onSelect(skill.name)
          dialog.clear()
        },
      })),
      query(),
    )
  })

  return (
    <DialogSelect
      title="Skills"
      placeholder="Search skills..."
      options={options()}
      onFilter={setQuery}
      skipFilter={true}
      renderFilter={!showError()}
      locked={showError()}
      emptyView={
        showError() ? (
          <box paddingLeft={4} paddingRight={4}>
            <text fg={theme.error} attributes={TextAttributes.BOLD}>
              Could not load skills
            </text>
            <text fg={theme.textMuted}>{errorMessage(loadError())}</text>
          </box>
        ) : undefined
      }
    />
  )
}

// Match on the skill name and its description so a skill can be found by what it does,
// not only by what it is called.
//
// fuzzysort decides what matches, but it scores a skill by its single best field and penalizes
// long targets (titles are padded to a common width), so a description hit could outrank a name
// hit. Rank explicitly instead: keyword (contiguous) matches before character-level ones, and the
// name before the description at each strength. fuzzysort's score orders skills within a tier.
//
// The query is normalized before fuzzysort sees it, because its score depends on the literal
// query: "a  b" scores differently from "a b", and it de-duplicates words before lower-casing,
// so "pdf PDF" (two words) scores differently from "pdf pdf" (one word).
export function filterSkills<T extends { title: string; description?: string }>(options: T[], query: string) {
  const needle = query.trim().replace(/\s+/g, " ").toLowerCase()
  if (!needle) return options
  const terms = needle.split(" ")
  const tier = (option: T) => {
    const title = option.title.toLowerCase()
    const description = option.description?.toLowerCase() ?? ""
    if (terms.every((term) => title.includes(term))) return 0
    if (terms.every((term) => title.includes(term) || description.includes(term))) return 1
    if (fuzzysort.single(needle, option.title)) return 2
    return 3
  }
  return fuzzysort
    .go(needle, options, { keys: ["title", "description"] })
    .map((result) => ({ option: result.obj, score: result.score, tier: tier(result.obj) }))
    .toSorted((a, b) => a.tier - b.tier || b.score - a.score)
    .map((result) => result.option)
}
