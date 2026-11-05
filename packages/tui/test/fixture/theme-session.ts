import { testRender } from "@opentui/solid"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { createComponent, onMount } from "solid-js"
import { ArgsProvider } from "../../src/context/args"
import { ExitProvider } from "../../src/context/exit"
import { KVProvider } from "../../src/context/kv"
import { PermissionProvider } from "../../src/context/permission"
import { ProjectProvider } from "../../src/context/project"
import { RouteProvider, useRoute } from "../../src/context/route"
import { SDKProvider } from "../../src/context/sdk"
import { SyncProvider, useSync } from "../../src/context/sync"
import { ThemeProvider, useTheme } from "../../src/context/theme"
import { TuiConfigProvider } from "../../src/config"
import { PromptHistoryProvider, usePromptHistory } from "../../src/prompt/history"
import { createEventSource, createFetch } from "./tui-sdk"
import { TestTuiContexts } from "./tui-environment"
import { createTuiResolvedConfig } from "./tui-runtime"

export async function mountThemeSession(root: string, state: string) {
  const events = createEventSource()
  const calls = createFetch()
  let context!:
    | {
        sync: ReturnType<typeof useSync>
        route: ReturnType<typeof useRoute>
        theme: ReturnType<typeof useTheme>
        history: ReturnType<typeof usePromptHistory>
      }
    | undefined
  let mounted!: () => void
  const ready = new Promise<void>((resolve) => {
    mounted = resolve
  })

  function Probe() {
    context = { sync: useSync(), route: useRoute(), theme: useTheme(), history: usePromptHistory() }
    onMount(mounted)
    return null
  }

  const app = await testRender(() =>
    createComponent(TestTuiContexts, {
      directory: root,
      paths: { home: root, state, worktree: root },
      get children() {
        return createComponent(ArgsProvider, {
          get children() {
            return createComponent(KVProvider, {
              get children() {
                return createComponent(RouteProvider, {
                  get children() {
                    return createComponent(TuiConfigProvider, {
                      config: createTuiResolvedConfig(),
                      get children() {
                        return createComponent(SDKProvider, {
                          url: "http://test",
                          directory: root,
                          fetch: calls.fetch,
                          events: events.source,
                          get children() {
                            return createComponent(PermissionProvider, {
                              get children() {
                                return createComponent(ProjectProvider, {
                                  get children() {
                                    return createComponent(ExitProvider, {
                                      exit: () => {},
                                      get children() {
                                        return createComponent(SyncProvider, {
                                          get children() {
                                            return createComponent(ThemeProvider, {
                                              mode: "dark",
                                              source: { discover: async () => ({}) },
                                              get children() {
                                                return createComponent(PromptHistoryProvider, {
                                                  get children() {
                                                    return createComponent(Probe, {})
                                                  },
                                                })
                                              },
                                            })
                                          },
                                        })
                                      },
                                    })
                                  },
                                })
                              },
                            })
                          },
                        })
                      },
                    })
                  },
                })
              },
            })
          },
        })
      },
    }),
  )

  await ready
  if (!context) throw new Error("theme session context did not mount")
  await wait(() => context!.sync.status === "complete")
  return {
    app,
    ...context,
    emit(payload: GlobalEvent["payload"]) {
      events.emit({ directory: root, project: "proj_test", payload })
    },
  }
}

export async function wait(check: () => boolean, timeout = 2_000) {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}
