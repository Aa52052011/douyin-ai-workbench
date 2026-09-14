import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SAPI_TIMEOUT_MS = 90_000;

export async function synthesizeWithWindowsSapi(text: string, speed = 1): Promise<Buffer | null> {
  if (process.platform !== 'win32' || !text.trim()) {
    return null;
  }
  const work = await mkdtemp(path.join(os.tmpdir(), 'acf-sapi-'));
  const textPath = path.join(work, 'speak.txt');
  const wavPath = path.join(work, 'voice.wav');
  const scriptPath = path.join(work, 'speak.ps1');
  const rate = Math.max(-10, Math.min(10, Math.round((speed - 1) * 6)));
  try {
    await writeFile(textPath, text, 'utf8');
    await writeFile(
      scriptPath,
      [
        'param([string]$TextFile,[string]$WavFile,[int]$Rate)',
        'Add-Type -AssemblyName System.Speech',
        '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        'try {',
        '  $zh = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo } | Where-Object { $_.Culture.Name -like "zh*" } | Select-Object -First 1',
        '  if ($zh) { $synth.SelectVoice($zh.Name) }',
        '  $synth.Rate = $Rate',
        '  $synth.SetOutputToWaveFile($WavFile)',
        '  $text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)',
        '  $synth.Speak($text)',
        '} finally { $synth.Dispose() }',
      ].join('\n'),
      'utf8',
    );
    const code = await runPowershell(scriptPath, textPath, wavPath, rate);
    if (code !== 0) {
      return null;
    }
    const body = await readFile(wavPath);
    return body.length > 44 ? body : null;
  } catch {
    return null;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runPowershell(scriptPath: string, textPath: string, wavPath: string, rate: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-TextFile',
        textPath,
        '-WavFile',
        wavPath,
        '-Rate',
        String(rate),
      ],
      { windowsHide: true },
    );
    const timer = setTimeout(() => {
      child.kill();
      resolve(1);
    }, SAPI_TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(1);
    });
  });
}
