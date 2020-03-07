import * as aws from 'aws-sdk';

const COMPREHEND_BATCH_SIZE = 25;
const s3 = new aws.S3();
const comprehend = new aws.Comprehend();

/**
 * ジョブパラメータインタフェース
 *
 * @export
 * @interface IJobParameter
 */
export interface IJobParameter {
    id: string;
    srcBucket: string;
    objectKey: string;
    destBucket: string;
}

/**
 * 感情分析インタフェース
 *
 * @interface IComprehend
 */
interface IComprehend {
    id: string;
    topic: string;
    language: string;
    content: string;
    sentiment?: string;
    score?: {
        positive: number;
        negative: number;
        neutral: number;
        mixed: number;
    };
}

/**
 * ジョブ実行クラス
 *
 * @export
 * @class JobExecutor
 */
export class JobExecutor {
    /**
     * 入力先バケットのオブジェクトを感情分析して結果を出力先バケットに保存します。
     *
     * @static
     * @param {IJobParameter} job ジョブパラメータ
     * @returns {Promise<void>}
     * @memberof JobExecutor
     */
    public static async execute(job: IJobParameter): Promise<void> {
        const items = await JobExecutor.getItems(job.srcBucket, job.objectKey);
        const dict = JobExecutor.divideByLanguage(items);
        for (const tpl of dict) {
            await JobExecutor.detectSentiment(tpl[0], tpl[1]);
        }
        await JobExecutor.putJsonLines(job.destBucket, job.objectKey, items);
    }

    /**
     * JSON Lines形式のオブジェクトから感情分析対象データを取得します。
     *
     * @private
     * @param {string} srcBucket 入力先バケット名
     * @param {string} objectKey オブジェクト名
     * @returns {Promise<IComprehend[]>} 感情分析対象データ
     * @memberof JobExecutor
     */
    private static async getItems(srcBucket: string, objectKey: string): Promise<IComprehend[]> {
        const res = await s3
            .getObject({
                Bucket: srcBucket,
                Key: objectKey,
            })
            .promise();

        const items: IComprehend[] = [];

        if (res.Body) {
            const lines = res.Body.toString().split(/\r?\n/);
            lines.forEach(text => {
                if (text) {
                    const obj: IComprehend = JSON.parse(text);
                    items.push(obj);
                }
            });
        }

        return new Promise(resolve => {
            resolve(items);
        });
    }

    /**
     * 感情分析対象データのリストを言語単位で分割します。
     *
     * @private
     * @param {IComprehend[]} items 感情分析対象データ
     * @returns {Map<string, IComprehend[]>} 言語をキーとする感情分析対象データ
     * @memberof JobExecutor
     */
    private static divideByLanguage(items: IComprehend[]): Map<string, IComprehend[]> {
        const dict = new Map<string, IComprehend[]>();

        items.forEach(item => {
            const key = item.language;
            const list = dict.get(key) || [];
            list.push(item);
            dict.set(key, list);
        });

        return dict;
    }

    /**
     * 感情分析を行います。
     *
     * @private
     * @static
     * @param {string} language 分析対象の言語
     * @param {IComprehend[]} items 感情分析対象データ
     * @returns {Promise<void>}
     * @memberof JobExecutor
     */
    private static async detectSentiment(language: string, items: IComprehend[]): Promise<void> {
        const blocks: IComprehend[][] = items.reduce<IComprehend[][]>(
            (prev, value, index) =>
                index % COMPREHEND_BATCH_SIZE ? prev : [...prev, items.slice(index, index + COMPREHEND_BATCH_SIZE)],
            [],
        );

        for (const list of blocks) {
            const res = await comprehend
                .batchDetectSentiment({
                    TextList: list.map(x => x.content),
                    LanguageCode: language,
                })
                .promise();

            res.ResultList.forEach(result => {
                const index = result.Index;
                if (index !== undefined) {
                    const doc = list[index];
                    doc.sentiment = result.Sentiment;
                    doc.score = {
                        positive: result.SentimentScore?.Positive || 0,
                        negative: result.SentimentScore?.Negative || 0,
                        neutral: result.SentimentScore?.Neutral || 0,
                        mixed: result.SentimentScore?.Mixed || 0,
                    };
                }
            });
        }
    }

    /**
     * JSON Lines形式のオブジェクトを出力します。
     *
     * @private
     * @static
     * @param {string} destBucket 出力先バケット名
     * @param {string} objectKey オブジェクト名
     * @param {IComprehend[]} items 感情分析結果データ
     * @returns {Promise<void>}
     * @memberof JobExecutor
     */
    private static async putJsonLines(destBucket: string, objectKey: string, items: IComprehend[]): Promise<void> {
        const lines: string[] = [];

        items.forEach(item => {
            const line = JSON.stringify(item);
            lines.push(line);
        });

        await s3
            .putObject({
                Bucket: destBucket,
                Key: objectKey,
                Body: lines.join('\n'),
            })
            .promise();
    }
}
