import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';

const DEBOUNCE_MS = 1500;
const COOLDOWN_MS = 3000;
const PROBE_TIMEOUT_MS = 1200;
const PROBE_FILE = path.join(os.tmpdir(), 'errorsound_lastexitcode.txt');

interface TerminalBatch {
    timer: NodeJS.Timeout | null;
    hasError: boolean;
    errorExitCode: number | undefined;
    hasRealSuccess: boolean;
    lastPlayTime: number;
}

const terminalBatches = new Map<vscode.Terminal, TerminalBatch>();

function getBatch(terminal: vscode.Terminal): TerminalBatch {
    let b = terminalBatches.get(terminal);
    if (!b) {
        b = { timer: null, hasError: false, errorExitCode: undefined,
              hasRealSuccess: false, lastPlayTime: 0 };
        terminalBatches.set(terminal, b);
    }
    return b;
}

const PLUMBING_PATTERNS = [
    /\.(ps1|sh|bash|bat|cmd|zsh|fish)(\s|$|['"])/i,
    /\bactivate\b/i,
    /\bdeactivate\b/i,
    /\bconda\s+(activate|deactivate)\b/i,
    /\b(nvm|fnm)\s+use\b/i,
    /\.(bashrc|zshrc|profile|bash_profile)\b/i,
    /^\s*&\s+['"]?.*activate/i,
    /^\s*source\s+/i,
    /^\s*\.\s+['"]?[^.]/i,
    /^\s*set-executionpolicy\b/i,
    /^\s*import-module\b/i,
    /^\s*(cd|chdir|set-location|push-location|pop-location)(\s|$)/i,
    /^\s*(cls|clear|clear-host)\s*$/i,
    /^\s*(mkdir|new-item|remove-item)\s/i,
];

function isPlumbing(cmd: string): boolean {
    return PLUMBING_PATTERNS.some(p => p.test(cmd));
}

function looksLikeExternalProgram(cmd: string): boolean {
    if (/^\s*&\s+/.test(cmd)) { return true; }
    if (/\.exe(\s|$|["'])/i.test(cmd)) { return true; }
    if (/^\s*(python|python3|py|node|java|javac|go\s+run|cargo\s+run|ruby|perl|gcc|g\+\+|make|cmake|dotnet|npm|npx|pip|git|rustc)\b/i.test(cmd)) { return true; }
    return false;
}

const probeCompletions = new Map<vscode.TerminalShellExecution, { resolve: () => void }>();

async function probeLastExitCode(
    shellIntegration: vscode.TerminalShellIntegration,
): Promise<number | null> {
    try { fs.unlinkSync(PROBE_FILE); } catch { }

    const probeCmd =
        `[IO.File]::WriteAllText("${PROBE_FILE.replace(/\\/g, '/')}","$LASTEXITCODE")`;
    const probe = shellIntegration.executeCommand(probeCmd);

    const completed = await new Promise<boolean>(resolve => {
        probeCompletions.set(probe, { resolve: () => resolve(true) });
        setTimeout(() => {
            if (probeCompletions.has(probe)) {
                probeCompletions.delete(probe);
                resolve(false);
            }
        }, PROBE_TIMEOUT_MS);
    });

    if (!completed) { return null; }

    await new Promise(r => setTimeout(r, 50));

    try {
        const raw = fs.readFileSync(PROBE_FILE, 'utf8').trim();
        const code = parseInt(raw, 10);
        return isNaN(code) ? null : code;
    } catch {
        return null;
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('error-sound.ErrorSounds', () =>
            vscode.window.showInformationMessage('Error Sound extension is running!'),
        ),
    );

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal(terminal => {
            const b = terminalBatches.get(terminal);
            if (b?.timer) { clearTimeout(b.timer); }
            terminalBatches.delete(terminal);
        }),
    );

    context.subscriptions.push(
        vscode.window.onDidEndTerminalShellExecution(async event => {
            const probeCompletion = probeCompletions.get(event.execution);
            if (probeCompletion) {
                probeCompletions.delete(event.execution);
                probeCompletion.resolve();
                return;
            }

            const terminalName = event.terminal.name;
            if (terminalName.startsWith('Task - ') || terminalName.startsWith('task - ')) { return; }
            if (event.exitCode === undefined) { return; }

            const commandLine = event.execution.commandLine.value.trim();
            if (commandLine === '' || commandLine.includes('errorsound_lastexitcode')) { return; }
            if (isPlumbing(commandLine)) { return; }

            let isError = event.exitCode !== 0;

            if (!isError && event.shellIntegration && looksLikeExternalProgram(commandLine)) {
                try {
                    const realCode = await probeLastExitCode(event.shellIntegration);
                    if (realCode !== null && realCode !== 0) {
                        isError = true;
                    }
                } catch { }
            }

            const batch = getBatch(event.terminal);

            if (isError) {
                batch.hasError = true;
                batch.errorExitCode = event.exitCode;
            } else {
                batch.hasRealSuccess = true;
            }

            if (batch.timer) { clearTimeout(batch.timer); }
            batch.timer = setTimeout(() => {
                resolveBatch(event.terminal, context.extensionPath);
            }, DEBOUNCE_MS);
        }),
    );
}

function resolveBatch(terminal: vscode.Terminal, extensionPath: string) {
    const batch = terminalBatches.get(terminal);
    if (!batch) { return; }

    const now = Date.now();
    const cooldownOk = now - batch.lastPlayTime >= COOLDOWN_MS;

    if (batch.hasError && cooldownOk) {
        batch.lastPlayTime = now;
        playSound(extensionPath, 'fahhh.wav');
        vscode.window.showErrorMessage('fahhh');
    } else if (batch.hasRealSuccess && cooldownOk) {
        batch.lastPlayTime = now;
        playSound(extensionPath, 'heythatprettygood.wav');
        vscode.window.showInformationMessage('hey thats pretty good');
    }

    batch.timer = null;
    batch.hasError = false;
    batch.errorExitCode = undefined;
    batch.hasRealSuccess = false;
}

function playSound(extensionPath: string, filename: string) {
    const soundPath = path.join(extensionPath, 'media', filename);
    const scriptPath = path.join(extensionPath, 'media', 'play.ps1');
    execFile('powershell', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath, '-soundFile', soundPath,
    ], () => {});
}

export function deactivate() { }