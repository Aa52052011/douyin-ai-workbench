import { Injectable } from '@nestjs/common';
import { DOUYIN_OFFICIAL_PROVIDER_ID, type DouyinCreateVideoRequestV1, type DouyinUploadVideoRequestV1 } from '../providers/douyin-official-open-platform.v1.js';
import { DouyinCreateVideoClientV1 } from './douyin-create.client.js';
import { FakeDouyinHttpTransport, RealDouyinHttpTransport, type DouyinHttpTransport } from './douyin-http.transport.js';
import { InMemoryPublicationExecutionStore } from './douyin-publication-state-machine.js';
import { validateDouyinProviderConfig } from './douyin-runtime-config.js';
import { DouyinUploadVideoClientV1 } from './douyin-upload.client.js';
import type { DouyinUploadClientContext } from './douyin-upload.client.js';
import type { DouyinCreateClientContext } from './douyin-create.client.js';
import { isDouyinLiveApiEnabled } from './douyin-runtime-config.js';

export class DouyinPublishingProviderV1 {
  readonly providerId = DOUYIN_OFFICIAL_PROVIDER_ID;
  readonly upload: DouyinUploadVideoClientV1;
  readonly create: DouyinCreateVideoClientV1;
  readonly executions: InMemoryPublicationExecutionStore;
  readonly transport: DouyinHttpTransport;

  constructor(transport?: DouyinHttpTransport, executions?: InMemoryPublicationExecutionStore) {
    this.transport = transport ?? new RealDouyinHttpTransport();
    this.executions = executions ?? new InMemoryPublicationExecutionStore();
    this.upload = new DouyinUploadVideoClientV1(this.transport, this.executions);
    this.create = new DouyinCreateVideoClientV1(this.transport, this.executions);
  }

  getCapabilities() {
    return {
      uploadVideo: true as const,
      createVideo: true as const,
      schedule: false as const,
      liveCalls: isDouyinLiveApiEnabled(),
      requiredScope: 'video.create.bind' as const,
      uploadModes: ['SIMPLE_UPLOAD', 'CHUNKED_UPLOAD'] as const,
    };
  }

  validateConfig() {
    return validateDouyinProviderConfig();
  }

  uploadVideo(request: DouyinUploadVideoRequestV1, ctx: DouyinUploadClientContext) {
    return this.upload.uploadVideo(request, ctx);
  }

  createVideo(request: DouyinCreateVideoRequestV1, ctx: DouyinCreateClientContext) {
    return this.create.createVideo(request, ctx);
  }
}

@Injectable()
export class DouyinPublishingProviderRuntime {
  createFake(): DouyinPublishingProviderV1 {
    return new DouyinPublishingProviderV1(new FakeDouyinHttpTransport());
  }

  createReal(): DouyinPublishingProviderV1 {
    return new DouyinPublishingProviderV1(new RealDouyinHttpTransport());
  }
}
