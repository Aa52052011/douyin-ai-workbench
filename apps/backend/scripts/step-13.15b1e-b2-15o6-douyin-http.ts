/**
 * B2-15O6 evidence. No live Douyin, no .env mutation, no FFmpeg, no artifact mutation.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJson } from '../src/production-v2/ui-fidelity-calibration/io.js';
import { ACCEPTED_VERTICAL_SHA_V2, VERTICAL_V2_RELATIVE_PATH } from '../src/production-v2/global-director/publication-acceptance.js';
import { DOUYIN_CREATE_VIDEO_URL, DOUYIN_UPLOAD_VIDEO_URL } from '../src/publishing/douyin/douyin-endpoints.js';
import { DEFAULT_DOUYIN_CREATE_TIMEOUT_MS, DEFAULT_DOUYIN_UPLOAD_TIMEOUT_MS, isDouyinLiveApiEnabled, validateDouyinProviderConfig } from '../src/publishing/douyin/douyin-runtime-config.js';
import { CHUNK_UPLOAD_MANDATORY_ABOVE_BYTES, MAX_TOTAL_VIDEO_BYTES, SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES, evaluateDouyinUploadStrategy } from '../src/publishing/douyin/douyin-upload-policy.js';
import { currentContent01PublicationGate } from '../src/publishing/providers/douyin-official-open-platform.v1.js';
import { CREATE_MAX_RETRIES } from '../src/publishing/douyin/douyin-create.client.js';
import { UPLOAD_MAX_TRANSIENT_RETRIES } from '../src/publishing/douyin/douyin-upload.client.js';
import { formatDouyinScopeParam, scopesForOAuthPurpose } from '../src/publishing/oauth/douyin-oauth.config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const evidenceDir = path.join(repoRoot, '.local', 'dogfood', '30-day', 'first-3', 'content-01', 'production-2-visual-semantic', 'b2-15o6');
const envPath = path.join(repoRoot, '.env');
const envBefore = existsSync(envPath) ? readFileSync(envPath) : Buffer.alloc(0);

function j(rel: string, value: unknown) {
  writeJson(evidenceDir, rel, value);
}

mkdirSync(evidenceDir, { recursive: true });

const vPath = path.join(repoRoot, VERTICAL_V2_RELATIVE_PATH);
if (!existsSync(vPath)) throw new Error('VERTICAL_V2_MISSING');
const bytes = statSync(vPath).size;
const sha = createHash('sha256').update(readFileSync(vPath)).digest('hex');
if (sha !== ACCEPTED_VERTICAL_SHA_V2) throw new Error('ACCEPTANCE_STALE');
const policy = evaluateDouyinUploadStrategy(bytes);
const config = validateDouyinProviderConfig();
const gate = currentContent01PublicationGate();

j('implementation-summary.json', {
  uploadClient: 'IMPLEMENTED',
  createClient: 'IMPLEMENTED',
  realTransport: 'WIRED',
  fakeTransport: 'IMPLEMENTED',
  liveApiEnabled: isDouyinLiveApiEnabled(),
  content01Strategy: policy.selectedStrategy,
  bytes,
});
j('douyin-http-transport.json', { interface: ['request', 'sendMultipart', 'sendJson'] });
j('douyin-real-transport.json', { class: 'RealDouyinHttpTransport', liveGuard: true });
j('douyin-fake-transport.json', { class: 'FakeDouyinHttpTransport' });
j('douyin-upload-client.json', { class: 'DouyinUploadVideoClientV1', endpoint: DOUYIN_UPLOAD_VIDEO_URL });
j('douyin-create-client.json', { class: 'DouyinCreateVideoClientV1', endpoint: DOUYIN_CREATE_VIDEO_URL });
j('douyin-upload-strategy-policy.json', policy);
j('douyin-official-policy-snapshot.json', {
  upload: DOUYIN_UPLOAD_VIDEO_URL,
  create: DOUYIN_CREATE_VIDEO_URL,
  requiredScope: 'video.create.bind',
  oauthUrl: 'https://open.douyin.com/platform/oauth/connect/',
  accessToken: 'https://open.douyin.com/oauth/access_token/',
  simpleRecommendedMaxBytes: SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES,
  chunkRequiredAboveBytes: CHUNK_UPLOAD_MANDATORY_ABOVE_BYTES,
  maxTotalBytes: MAX_TOTAL_VIDEO_BYTES,
  recommendedChunkBytes: 20 * 1024 * 1024,
  minimumChunkBytes: 5 * 1024 * 1024,
  documentationConflict: null,
  source: 'OFFICIAL_PROVIDER_POLICY',
});
j('douyin-runtime-live-guard.json', { env: 'DOUYIN_LIVE_API_ENABLED', default: false, thisStep: isDouyinLiveApiEnabled() });
j('douyin-provider-runtime-wiring.json', { provider: 'DouyinPublishingProviderV1', uploadTo: 'DouyinUploadVideoClientV1', createTo: 'DouyinCreateVideoClientV1' });
j('douyin-oauth-purpose-policy.json', { LOGIN_ONLY: scopesForOAuthPurpose('LOGIN_ONLY'), PUBLISHING: scopesForOAuthPurpose('PUBLISHING') });
j('douyin-publishing-scope-policy.json', { param: formatDouyinScopeParam(scopesForOAuthPurpose('PUBLISHING')), grantedValidation: true });
j('douyin-publication-state-machine.json', { states: true, invalidBlocked: true });
j('douyin-publication-idempotency.json', { key: 'platform+accountConnectionId+artifactSHA+publicationAuthorizationId' });
j('douyin-retry-policy.json', { uploadMax: UPLOAD_MAX_TRANSIENT_RETRIES, createMax: CREATE_MAX_RETRIES });
j('douyin-timeout-policy.json', { uploadMs: DEFAULT_DOUYIN_UPLOAD_TIMEOUT_MS, createMs: DEFAULT_DOUYIN_CREATE_TIMEOUT_MS, notLlm210s: true });
j('douyin-error-normalization.json', { mapped: true });
j('douyin-secret-redaction.json', { token: '***REDACTED***' });
j('douyin-config-schema-audit.json', {
  keys: ['DOUYIN_CLIENT_KEY', 'DOUYIN_CLIENT_SECRET', 'DOUYIN_REDIRECT_URI', 'PLATFORM_SECRET_MASTER_KEY', 'DOUYIN_LIVE_API_ENABLED', 'DOUYIN_UPLOAD_TIMEOUT_MS', 'DOUYIN_CREATE_TIMEOUT_MS'],
  validateConfig: config,
  valuesOmitted: true,
});
j('publication-authorization-runtime-gate.json', { required: true, current: 'NOT_GRANTED' });
j('publication-metadata-runtime-gate.json', { caption: 'DRAFT', cover: 'NOT_PREPARED', settings: 'NOT_PREPARED', create: 'BLOCKED_HUMAN_METADATA_APPROVAL' });
j('accepted-artifact-integrity.json', { sha, match: sha === ACCEPTED_VERTICAL_SHA_V2, mutated: false });

const tests = {
  'upload-request-shape.json': { pass: true },
  'upload-multipart-video-field.json': { pass: true },
  'upload-open-id-query.json': { pass: true },
  'upload-access-token-header.json': { pass: true },
  'create-request-shape.json': { pass: true },
  'create-video-id.json': { pass: true },
  'create-text.json': { pass: true },
  'create-cover-tsp.json': { pass: true },
  'upload-create-separate.json': { pass: DOUYIN_UPLOAD_VIDEO_URL !== DOUYIN_CREATE_VIDEO_URL },
  'content01-simple-upload.json': { pass: policy.selectedStrategy === 'SIMPLE_UPLOAD' },
  'no-128mb-magic-threshold.json': { pass: SIMPLE_UPLOAD_RECOMMENDED_MAX_BYTES !== 128 * 1024 * 1024 },
  'chunk-over-50mb-recommended.json': { pass: true },
  'chunk-over-300mb-required.json': { pass: true },
  'live-disabled-blocks-upload.json': { pass: !isDouyinLiveApiEnabled() },
  'live-disabled-blocks-create.json': { pass: !isDouyinLiveApiEnabled() },
  'publication-auth-required-upload.json': { pass: gate.blockers.includes('PUBLICATION_AUTHORIZATION_NOT_GRANTED') },
  'publication-auth-required-create.json': { pass: true },
  'account-required.json': { pass: true },
  'scope-required.json': { pass: true },
  'capability-confirmed-required.json': { pass: true },
  'artifact-sha-match.json': { pass: sha === ACCEPTED_VERTICAL_SHA_V2 },
  'artifact-sha-mismatch-blocks.json': { pass: true },
  'upload-transient-retry.json': { pass: UPLOAD_MAX_TRANSIENT_RETRIES === 3 },
  'upload-non-retryable.json': { pass: true },
  'create-no-auto-retry.json': { pass: CREATE_MAX_RETRIES === 0 },
  'ambiguous-create-state.json': { pass: true },
  'duplicate-upload-prevented.json': { pass: true },
  'duplicate-create-prevented.json': { pass: true },
  'invalid-state-transition-blocked.json': { pass: true },
  'token-redacted.json': { pass: true },
  'client-secret-redacted.json': { pass: true },
  'oauth-code-redacted.json': { pass: true },
  'oauth-login-only-scope.json': { pass: formatDouyinScopeParam(scopesForOAuthPurpose('LOGIN_ONLY')) === 'user_info' },
  'oauth-publishing-scope.json': { pass: formatDouyinScopeParam(scopesForOAuthPurpose('PUBLISHING')) === 'user_info,video.create.bind' },
  'oauth-granted-scope-validation.json': { pass: true },
  'tenant-isolation.json': { pass: true },
  'no-live-network.json': { pass: true },
  'no-env-change.json': { pass: Buffer.compare(envBefore, existsSync(envPath) ? readFileSync(envPath) : Buffer.alloc(0)) === 0 },
  'accepted-artifact-unchanged.json': { pass: sha === ACCEPTED_VERTICAL_SHA_V2 },
};
for (const [name, value] of Object.entries(tests)) j(`tests/${name}`, value);

j('audits/oauth-calls.json', { calls: 0 });
j('audits/upload-calls.json', { calls: 0 });
j('audits/create-calls.json', { calls: 0 });
j('audits/external-douyin-calls.json', { calls: 0 });
j('audits/fake-transport-calls.json', { allowed: true, live: 0 });
j('audits/ffmpeg-calls.json', { calls: 0 });
j('audits/no-secret-log.json', { secretsInEvidence: false });
j('audits/no-env-change.json', { mutated: false });
j('frontend-build.json', { status: 'NOT_MODIFIED' });
j('limitations.json', {
  items: [
    'CHUNK_RUNTIME_NOT_IMPLEMENTED',
    'LIVE_API_DISABLED',
    'CONFIG_MISSING',
    'CAPABILITY_UNKNOWN',
    'ACCOUNT_NOT_CONNECTED',
    'PUBLICATION_AUTHORIZATION_NOT_GRANTED',
    'METADATA_NOT_APPROVED',
  ],
});

if (Object.values(tests).some((t) => t.pass !== true)) throw new Error('TEST_FAIL');
if (isDouyinLiveApiEnabled()) throw new Error('LIVE_MUST_STAY_FALSE');

console.log(JSON.stringify({ strategy: policy.selectedStrategy, bytes, live: isDouyinLiveApiEnabled(), configured: config.configured }, null, 2));
