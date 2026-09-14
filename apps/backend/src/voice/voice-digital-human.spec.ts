import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { DEFAULT_SYSTEM_VOICE_ID, getVoice, listSupportedVoicesPublic, validateVoiceSelection } from './voice.registry.js';
import { resolveVoiceConfig } from './voice-resolve.js';
import { isVoiceProfileProductionEligible } from './voice-eligibility.js';
import { isDigitalHumanProfileProductionEligible } from '../digital-human/digital-human-eligibility.js';
import { DisabledDigitalHumanProvider } from '../media/providers/disabled-digital-human.provider.js';
import { DisabledVoiceCloneProvider } from '../media/providers/disabled-voice-clone.provider.js';
import { isDigitalHumanCurrentlyAvailable } from '../media/dh/digital-human-config.js';
import { isVoiceCloneCurrentlyAvailable } from '../media/voice-clone/voice-clone-config.js';
import { ErrorCode } from '../common/errors/app-error.js';

describe('voice / digital-human foundation', () => {
  it('lists system voices without raw provider ids', () => {
    const list = listSupportedVoicesPublic();
    assert.ok(list.some((v) => v.id === DEFAULT_SYSTEM_VOICE_ID));
    assert.equal(JSON.stringify(list).includes('providerVoiceId'), false);
    const v = getVoice(DEFAULT_SYSTEM_VOICE_ID);
    assert.ok(v?.providerVoiceId);
  });

  it('resolves invalid preferred voice to default', () => {
    const ok = validateVoiceSelection('sys.calm');
    assert.equal(ok.ok, true);
    const resolved = resolveVoiceConfig({ preferredVoiceId: 'not-a-voice' });
    assert.equal(resolved.resolvedVoiceId, DEFAULT_SYSTEM_VOICE_ID);
    assert.equal(resolved.voiceType, 'SYSTEM');
  });

  it('blocks revoked / pending / reference voice clone', () => {
    const sample = {
      tenantId: 't',
      deletedAt: null,
      status: 'READY',
      type: 'VOICE_SAMPLE',
      sourceType: 'USER_UPLOAD',
      referenceOnly: false,
      rightsStatus: 'OWNED',
      consentStatus: 'CONFIRMED',
    } as const;
    const pending = isVoiceProfileProductionEligible({
      profile: {
        tenantId: 't',
        workspaceId: 'w',
        type: 'CLONED',
        status: 'READY',
        rightsStatus: 'OWNED',
        consentStatus: 'PENDING',
      },
      tenantId: 't',
      workspaceId: 'w',
      sample,
    });
    assert.equal(pending.eligible, false);
    assert.ok(pending.reasonCodes.includes('CONSENT_REQUIRED'));
    const revoked = isVoiceProfileProductionEligible({
      profile: {
        tenantId: 't',
        workspaceId: 'w',
        type: 'CLONED',
        status: 'READY',
        rightsStatus: 'OWNED',
        consentStatus: 'REVOKED',
      },
      tenantId: 't',
      workspaceId: 'w',
      sample,
    });
    assert.equal(revoked.eligible, false);
    const ref = isVoiceProfileProductionEligible({
      profile: {
        tenantId: 't',
        workspaceId: 'w',
        type: 'CLONED',
        status: 'READY',
        rightsStatus: 'OWNED',
        consentStatus: 'CONFIRMED',
      },
      tenantId: 't',
      workspaceId: 'w',
      sample: { ...sample, referenceOnly: true, sourceType: 'REFERENCE' },
    });
    assert.equal(ref.eligible, false);
    assert.ok(ref.reasonCodes.includes('REFERENCE_SOURCE'));
  });

  it('blocks digital human without provider, consent, or reference source', () => {
    assert.equal(isDigitalHumanCurrentlyAvailable(), false);
    assert.equal(isVoiceCloneCurrentlyAvailable(), false);
    const source = {
      tenantId: 't',
      deletedAt: null,
      status: 'READY',
      type: 'IMAGE',
      sourceType: 'USER_UPLOAD',
      referenceOnly: false,
      rightsStatus: 'OWNED',
      consentStatus: 'CONFIRMED',
    } as const;
    const ready = isDigitalHumanProfileProductionEligible({
      profile: {
        tenantId: 't',
        workspaceId: 'w',
        status: 'READY',
        rightsStatus: 'OWNED',
        consentStatus: 'CONFIRMED',
        sourceAssetId: 'a',
      },
      tenantId: 't',
      workspaceId: 'w',
      source,
    });
    assert.equal(ready.eligible, false);
    assert.ok(ready.reasonCodes.includes('PROVIDER_NOT_CONFIGURED'));
    const ref = isDigitalHumanProfileProductionEligible({
      profile: {
        tenantId: 't',
        workspaceId: 'w',
        status: 'READY',
        rightsStatus: 'OWNED',
        consentStatus: 'CONFIRMED',
        sourceAssetId: 'a',
      },
      tenantId: 't',
      workspaceId: 'w',
      source: { ...source, referenceOnly: true, sourceType: 'REFERENCE' },
    });
    assert.ok(ref.reasonCodes.includes('REFERENCE_SOURCE'));
  });

  it('disabled providers throw configured errors, never fake READY', async () => {
    const dh = new DisabledDigitalHumanProvider();
    await assert.rejects(() => dh.generateTalkingVideo({
      profileId: 'p',
      jobId: 'j',
      videoId: 'v',
      generationVersion: 'g',
    }), (err: { code?: string }) => err.code === ErrorCode.DIGITAL_HUMAN_PROVIDER_NOT_CONFIGURED);
    const clone = new DisabledVoiceCloneProvider();
    await assert.rejects(() => clone.createVoiceProfile({ profileId: 'p', sampleAssetId: 'a' }), (err: { code?: string }) => err.code === ErrorCode.VOICE_CLONE_PROVIDER_NOT_CONFIGURED);
  });
});
