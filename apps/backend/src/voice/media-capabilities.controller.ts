import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../authz/permissions.guard.js';
import { isDigitalHumanCurrentlyAvailable } from '../media/dh/digital-human-config.js';
import { resolveImageProviderId } from '../media/visual/visual-config.js';
import { isVoiceCloneCurrentlyAvailable } from '../media/voice-clone/voice-clone-config.js';
import { resolveTtsProviderId } from '../media/tts/tts-config.js';

@Controller('media-capabilities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MediaCapabilitiesController {
  @Get()
  get() {
    let systemVoice = false;
    try {
      resolveTtsProviderId();
      systemVoice = true;
    } catch {
      systemVoice = false;
    }
    let aiImage = false;
    try {
      const image = resolveImageProviderId();
      aiImage = image === 'wanx' || image === 'color-background';
    } catch {
      aiImage = false;
    }
    const digitalHuman = isDigitalHumanCurrentlyAvailable();
    const voiceClone = isVoiceCloneCurrentlyAvailable();
    return {
      systemVoice: { available: systemVoice, statusLabel: systemVoice ? '可用' : '未配置' },
      voiceClone: {
        available: voiceClone,
        statusLabel: voiceClone ? '可用' : '声音克隆服务尚未配置',
      },
      digitalHuman: {
        available: digitalHuman,
        statusLabel: digitalHuman ? '可用' : '数字人生成服务尚未配置',
      },
      aiImage: { available: aiImage, statusLabel: aiImage ? '可用' : '未配置' },
      aiVideo: { available: false, statusLabel: '尚未配置' },
    };
  }
}
