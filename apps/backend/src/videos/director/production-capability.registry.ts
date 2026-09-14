/**
 * Step 13.8 — Production Capability Registry.
 * DIGITAL_HUMAN / VOICE_CLONE are dynamic from provider config — never true without a real provider.
 */

import { resolveTtsProviderId } from '../../media/tts/tts-config.js';
import { isDigitalHumanCurrentlyAvailable } from '../../media/dh/digital-human-config.js';
import { isVoiceCloneCurrentlyAvailable } from '../../media/voice-clone/voice-clone-config.js';
import type { MaterialSource, ProductionMode } from './production-director.types.js';

export const CAPABILITY_REGISTRY_VERSION = 'v1.1' as const;

export type CapabilityId =
  | 'REAL_FOOTAGE'
  | 'USER_LIBRARY'
  | 'PROJECT_HISTORY'
  | 'GENERATED_REUSABLE'
  | 'SYSTEM_LIBRARY'
  | 'AI_IMAGE'
  | 'SYSTEM_VOICE'
  | 'SUBTITLE_STANDARD'
  | 'FFMPEG_COMPOSE'
  | 'DIGITAL_HUMAN'
  | 'AI_VIDEO'
  | 'VOICE_CLONE';

export type CapabilityEntry = {
  id: CapabilityId;
  supported: boolean;
  currentlyAvailable: boolean;
  label: string;
};

function systemVoiceAvailable(): boolean {
  try {
    resolveTtsProviderId();
    return true;
  } catch {
    return false;
  }
}

export function listCapabilities(): CapabilityEntry[] {
  const dh = isDigitalHumanCurrentlyAvailable();
  const clone = isVoiceCloneCurrentlyAvailable();
  const systemVoice = systemVoiceAvailable();
  return [
    { id: 'REAL_FOOTAGE', supported: true, currentlyAvailable: true, label: '真实素材' },
    { id: 'USER_LIBRARY', supported: true, currentlyAvailable: true, label: '用户素材库' },
    { id: 'PROJECT_HISTORY', supported: true, currentlyAvailable: true, label: '项目历史素材' },
    { id: 'GENERATED_REUSABLE', supported: true, currentlyAvailable: true, label: '已生成可复用素材' },
    { id: 'SYSTEM_LIBRARY', supported: true, currentlyAvailable: true, label: '系统素材' },
    { id: 'AI_IMAGE', supported: true, currentlyAvailable: true, label: 'AI 图片（Wanx）' },
    { id: 'SYSTEM_VOICE', supported: true, currentlyAvailable: systemVoice, label: '系统旁白 TTS' },
    { id: 'SUBTITLE_STANDARD', supported: true, currentlyAvailable: true, label: '标准字幕' },
    { id: 'FFMPEG_COMPOSE', supported: true, currentlyAvailable: true, label: 'FFmpeg 合成' },
    { id: 'DIGITAL_HUMAN', supported: true, currentlyAvailable: dh, label: '数字人' },
    { id: 'AI_VIDEO', supported: false, currentlyAvailable: false, label: 'AI 视频' },
    { id: 'VOICE_CLONE', supported: true, currentlyAvailable: clone, label: '声音克隆' },
  ];
}

export function isCapabilityAvailable(id: CapabilityId): boolean {
  return listCapabilities().some((c) => c.id === id && c.currentlyAvailable);
}

export function materialSourceAvailable(source: MaterialSource): boolean {
  switch (source) {
    case 'CURRENT_UPLOAD':
    case 'USER_LIBRARY':
    case 'PROJECT_HISTORY':
    case 'GENERATED_REUSABLE':
    case 'SYSTEM_LIBRARY':
      return true;
    case 'AI_IMAGE':
      return isCapabilityAvailable('AI_IMAGE');
    case 'AI_VIDEO':
      return isCapabilityAvailable('AI_VIDEO');
    case 'DIGITAL_HUMAN':
      return isCapabilityAvailable('DIGITAL_HUMAN');
    default:
      return false;
  }
}

export function modeHasExecutablePath(
  mode: ProductionMode,
  options?: { hasEligibleRealAssets?: boolean; hasEligibleDigitalHuman?: boolean },
): { feasible: boolean; reason?: string } {
  const hasReal = options?.hasEligibleRealAssets === true;
  switch (mode) {
    case 'REAL_FOOTAGE':
      if (hasReal) return { feasible: true };
      return {
        feasible: false,
        reason: 'REAL_FOOTAGE requires eligible real assets or optional shoot fallback',
      };
    case 'DIGITAL_HUMAN_BROLL':
      if (!isCapabilityAvailable('DIGITAL_HUMAN') || options?.hasEligibleDigitalHuman !== true) {
        return { feasible: false, reason: 'DIGITAL_HUMAN unavailable' };
      }
      return { feasible: true };
    case 'VOICEOVER_ASSETS':
    case 'AI_ASSISTED':
    case 'HYBRID':
      return {
        feasible:
          isCapabilityAvailable('SYSTEM_VOICE') &&
          (isCapabilityAvailable('AI_IMAGE') || hasReal || isCapabilityAvailable('USER_LIBRARY')),
      };
    default:
      return { feasible: false, reason: 'unknown mode' };
  }
}

export function defaultExecutableFallbackSources(hasRealAssets: boolean): MaterialSource[] {
  const sources: MaterialSource[] = [];
  if (hasRealAssets) {
    sources.push('USER_LIBRARY', 'PROJECT_HISTORY', 'GENERATED_REUSABLE');
  }
  sources.push('SYSTEM_LIBRARY');
  if (isCapabilityAvailable('AI_IMAGE')) sources.push('AI_IMAGE');
  return sources;
}
