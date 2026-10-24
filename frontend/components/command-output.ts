import type { CommandExecutionResult } from '../../api.ts'
import * as uu from '../uu.ts'
import { showOneAuthAccounts } from './one-auth-manager.ts'
import type { CommandOutputBuffer } from './command-output-buffer.ts'
import type {
    CommandRun,
    CommandRunHistory,
    ProcessRun,
} from './command-run-history.ts'

function reportDialogError(error: unknown): void {
    alert(error instanceof Error ? error.message : String(error))
}

function poll(refresh: () => Promise<void>): () => void {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
        try {
            await refresh()
        } catch (error) {
            stopped = true
            reportDialogError(error)
        }
        if (!stopped) timer = setTimeout(tick, 500)
    }
    timer = setTimeout(tick, 500)
    return () => {
        stopped = true
        clearTimeout(timer)
    }
}

function observe(
    subscribe: (listener: () => void) => () => void,
    render: () => void,
): () => void {
    let frame: number | undefined
    const unsubscribe = subscribe(() => {
        if (frame === undefined) {
            frame = requestAnimationFrame(() => {
                frame = undefined
                render()
            })
        }
    })
    render()
    return () => {
        unsubscribe()
        if (frame !== undefined) cancelAnimationFrame(frame)
    }
}

function createOutputRegion(title: string, buffer: CommandOutputBuffer) {
    const region = document.createElement('section')
    const heading = document.createElement('h3')
    heading.textContent = `${title}:`
    const notice = document.createElement('p')
    notice.className = 'text-muted'
    notice.textContent =
        'Older output truncated; showing the most recent 1 MiB.'
    const output = document.createElement('pre')
    output.className = 'command-output-text'
    region.append(heading, notice, output)
    return {
        region,
        render() {
            const follow = output.scrollTop + output.clientHeight >=
                output.scrollHeight - 16
            output.textContent = buffer.text
            notice.hidden = !buffer.truncated
            if (follow) output.scrollTop = output.scrollHeight
        },
    }
}

function createProcessOutput(process: ProcessRun) {
    const panel = document.createElement('section')
    panel.className = 'command-output-panel'
    const heading = document.createElement('h2')
    heading.textContent = process.title
    const state = document.createElement('p')
    const resultRegion = document.createElement('section')
    const resultHeading = document.createElement('h3')
    resultHeading.textContent = 'Command Result:'
    const resultText = document.createElement('pre')
    resultText.className = 'command-output-text'
    resultRegion.append(resultHeading, resultText)
    const stdout = createOutputRegion('Command Output', process.stdout)
    const stderr = createOutputRegion('Command Error Output', process.stderr)
    panel.append(heading, state, resultRegion, stdout.region, stderr.region)
    return {
        panel,
        render() {
            state.textContent = process.state
            resultRegion.hidden = process.state === 'running'
            resultText.textContent = process.error ??
                (process.result
                    ? `Exit code: ${process.result.code}${
                        process.result.signal
                            ? `\nSignal: ${process.result.signal}`
                            : ''
                    }`
                    : '')
            stdout.render()
            stderr.render()
        },
    }
}

function renderResult(result: CommandExecutionResult): HTMLElement {
    const section = document.createElement('section')
    const heading = document.createElement('h3')
    heading.textContent = result.title
    section.append(heading)
    switch (result.type) {
        case 'message': {
            if (result.description) {
                const description = document.createElement('p')
                description.textContent = result.description
                section.append(description)
            }
            const text = document.createElement('pre')
            text.className = 'command-output-text'
            text.textContent = result.content
            section.append(text)
            break
        }
        case 'oneAuth': {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'btn btn-outline-primary'
            button.textContent =
                `View OneAuth accounts (${result.accounts.length})`
            button.onclick = () => {
                void showOneAuthAccounts(result.accounts, result.title)
                    .catch(reportDialogError)
            }
            section.append(button)
            break
        }
        case 'status': {
            const text = document.createElement('p')
            text.textContent = `${result.status.state}${
                result.status.message ? `: ${result.status.message}` : ''
            }`
            section.append(text)
            break
        }
        case 'terminal':
            break
    }
    return section
}

function createRunView(run: CommandRun) {
    const content = document.createElement('div')
    content.className = 'command-run-view'
    const state = document.createElement('p')
    state.className = 'command-run-state'
    const time = document.createElement('p')
    const error = document.createElement('pre')
    error.className = 'command-output-text text-danger'
    const results = document.createElement('section')
    const resultHeading = document.createElement('h2')
    resultHeading.textContent = 'Command Result:'
    const resultContent = document.createElement('div')
    results.append(resultHeading, resultContent)
    const processes = document.createElement('div')
    processes.className = 'command-outputs'
    content.append(state, time, error, results, processes)
    const processViews = new Map<
        string,
        ReturnType<typeof createProcessOutput>
    >()
    let renderedResults: CommandExecutionResult[] | undefined
    const dispose = observe(
        (listener) => run.subscribe(listener),
        () => {
            state.textContent = `Status: ${run.state}`
            time.textContent = `Started: ${run.startedAt.toLocaleString()}${
                run.finishedAt
                    ? ` | Finished: ${run.finishedAt.toLocaleString()}`
                    : ''
            }`
            error.hidden = run.error === undefined
            error.textContent = run.error ?? ''
            results.hidden = run.state === 'running' ||
                (run.processes.length > 0 &&
                    run.results.every((result) => result.type === 'terminal'))
            if (renderedResults !== run.results) {
                const items = run.results.filter((result) =>
                    result.type !== 'terminal'
                )
                resultContent.replaceChildren(...items.map(renderResult))
                if (!items.length) {
                    resultContent.textContent = 'Command completed.'
                }
                renderedResults = run.results
            }
            if (run.state === 'failed' && !run.results.length) {
                resultContent.textContent = run.error ?? 'Command failed.'
            }
            for (const process of run.processes) {
                let view = processViews.get(process.id)
                if (!view) {
                    view = createProcessOutput(process)
                    processViews.set(process.id, view)
                    processes.append(view.panel)
                }
                view.render()
            }
        },
    )
    return { content, dispose }
}

export function createRunHistoryDialogs(history: CommandRunHistory) {
    const openRuns = new Map<string, HTMLDialogElement>()

    const showRun = async (run: CommandRun): Promise<void> => {
        const existing = openRuns.get(run.id)
        if (existing) {
            existing.focus()
            return
        }
        await history.refreshRun(run)
        const view = createRunView(run)
        let finished = run.state !== 'running'
        const stopPolling = poll(async () => {
            if (!finished) {
                await history.refreshRun(run)
                finished = run.state !== 'running'
            }
        })
        try {
            await uu.showDialog(
                `Run: ${run.title}`,
                view.content,
                {
                    classes: ['command-run-dialog', 'command-run-output-dialog'],
                    actions: ['Close'],
                },
                ({ dialog }) => {
                    openRuns.set(run.id, dialog)
                    // The dialog library freezes its initial height after opening.
                    queueMicrotask(() => {
                        dialog.style.height = 'fit-content'
                    })
                },
            )
        } finally {
            stopPolling()
            view.dispose()
            openRuns.delete(run.id)
        }
    }

    const showHistory = async (commandId?: string): Promise<void> => {
        await history.refresh()
        const content = document.createElement('div')
        content.className = 'command-run-history'
        const dispose = observe(
            (listener) => history.subscribe(listener),
            () => {
                const runs = history.runs.filter((run) =>
                    commandId === undefined || run.commandId === commandId
                )
                content.replaceChildren()
                if (!runs.length) {
                    content.textContent = 'No runs yet.'
                    return
                }
                const runsById = new Map(runs.map((run) => [run.id, run]))
                const rows = runs.map((run) => ({
                    id: run.id,
                    title: run.title,
                    state: run.state,
                    startedAt: run.startedAt,
                    finishedAt: run.finishedAt,
                    error: run.error,
                }))
                const openRun = async (id: string) => {
                    const run = runsById.get(id)
                    if (!run) throw new Error(`Command run not found: ${id}`)
                    try {
                        await showRun(run)
                    } catch (error) {
                        reportDialogError(error)
                    }
                }
                content.append(uu.visualizeArray(rows, {
                    renderStyles: ['table', 'tile'],
                    renderOption: {
                        props: [
                            'title',
                            'state',
                            'startedAt',
                            'finishedAt',
                            'error',
                        ],
                        propOptions: {
                            startedAt: {
                                formatter: (item) =>
                                    item.startedAt.toLocaleString(),
                            },
                            finishedAt: {
                                formatter: (item) =>
                                    item.finishedAt?.toLocaleString() ?? '',
                            },
                            error: {
                                formatter: (item) => item.error ?? '',
                            },
                        },
                        onItemClick: async (item) => {
                            await openRun(item.id)
                            return true
                        },
                    },
                    itemActions: (item) => ({ '📂': () => openRun(item.id) }),
                    hideUniformProps: false,
                    rawIndexProp: '#',
                    stateKey: commandId
                        ? `MyEnvRunHistory:${commandId}`
                        : 'MyEnvRunHistory',
                }))
            },
        )
        try {
            await uu.showDialog('Run History', content, {
                classes: ['command-run-dialog'],
                actions: {
                    Refresh: async () => {
                        try {
                            await history.refresh()
                        } catch (error) {
                            reportDialogError(error)
                        }
                        return false
                    },
                    Close: () => true,
                },
            })
        } finally {
            dispose()
        }
    }

    return { showRun, showHistory }
}
