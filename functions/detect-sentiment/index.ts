import { JobExecutor, IJobParameter } from './job-executor';

/**
 * ステート要求インタフェース
 *
 * @export
 * @interface IStateRequest
 */
export interface IStateRequest {
    id: string;
    detail: {
        requestParameters: {
            bucketName: string;
            key: string;
        };
    };
}

/**
 * ステート応答インタフェース
 *
 * @export
 * @interface IStateResponse
 */
export interface IStateResponse {
    id: string;
    srcBucket: string;
    objectKey: string;
    destBucket: string;
}

/**
 * 感情分析用のLambda関数ハンドラ
 *
 * @export
 * @param {IStateRequest} event イベント情報
 * @returns {Promise<IStateResponse>}
 */
export async function handler(event: IStateRequest): Promise<IStateResponse> {
    const job: IJobParameter = {
        id: event.id,
        srcBucket: event.detail.requestParameters.bucketName,
        objectKey: event.detail.requestParameters.key,
        destBucket: process.env.DEST_BUCKET || '',
    };
    await JobExecutor.execute(job);
    return job;
}
