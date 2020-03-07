import * as aws from 'aws-sdk';

const s3 = new aws.S3();

/**
 * ジョブ実行クラス
 *
 * @export
 * @class JobExecutor
 */
export class JobExecutor {
    /**
     * バケット内のオブジェクトを削除します。
     *
     * @static
     * @param {string} bucketName バケット名
     * @param {string} objectKey オブジェクトキー
     * @returns {Promise<number>} ステータスコード
     * @memberof JobExecutor
     */
    public static async execute(bucketName: string, objectKey: string): Promise<number> {
        const ret = await s3
            .deleteObject({
                Bucket: bucketName,
                Key: objectKey,
            })
            .promise();

        return ret.$response.httpResponse.statusCode;
    }
}
