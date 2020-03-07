import { JobExecutor } from './job-executor';

/**
 * ステート情報インタフェース
 *
 * @export
 * @interface IStateInfo
 */
export interface IStateInfo {
    id: string;
    srcBucket: string;
    objectKey: string;
}

/**
 * S3オブジェクト削除用のLambda関数ハンドラ
 *
 * @export
 * @param {IStateInfo} event イベント情報
 * @returns {Promise<IStateInfo>}
 */
export async function handler(event: IStateInfo): Promise<IStateInfo> {
    await JobExecutor.execute(event.srcBucket, event.objectKey);
    return event;
}
