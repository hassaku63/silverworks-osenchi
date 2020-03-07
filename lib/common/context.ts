import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ConstructNode } from '@aws-cdk/core';

export class Context {
    /**
     * 環境変数 CDK_CONTEXT_JSON に JSON文字列を設定します。
     * 省略された場合は cdk.json 内のコンテキストを設定します。
     *
     * @static
     * @param {string} JSON文字列
     * @memberof Context
     */
    public static setEnvironment(json?: string): void {
        let str = json;
        if (!str) {
            const obj = JSON.parse(readFileSync(resolve('cdk.json')).toString());
            str = JSON.stringify(obj.context);
        }

        process.env.CDK_CONTEXT_JSON = str;
    }

    /**
     * 階層化したオブジェクトからキーに一致する値を取得します。
     *
     * @private
     * @static
     * @template T
     * @param {string[]} keys   キーリスト
     * @param {*} value 値
     * @returns {T}
     * @memberof Context
     */
    private static getValue<T>(keys: string[], value: any): T {
        if (keys.length === 0) {
            return value;
        }

        const key = keys[0];
        keys.shift();

        return Context.getValue(keys, value[key]);
    }

    /** ノード */
    readonly node: ConstructNode;

    /** コンテキストパス */
    readonly rootPath?: string;

    /**
     * インスタンスを初期化します。
     *
     * @param {ConstructNode} node ノード
     * @param {string} [rootPath] ルートパス
     * @memberof Context
     */
    constructor(node: ConstructNode, rootPath?: string) {
        this.node = node;
        this.rootPath = rootPath;
    }

    /**
     * キーを指定してコンテキスト値を取得します。 (cdk.json参照)
     *
     * @public
     * @param {string} key キー
     * @returns {string} コンテキスト値
     * @memberof Context
     */
    public get<T>(key: string): T {
        const root = this.node.tryGetContext(key);
        if (root !== undefined) {
            return root;
        }

        const stage = this.node.tryGetContext('stage');
        const value = this.node.tryGetContext(stage);

        let path = '';
        if (this.rootPath) {
            path = `${this.rootPath}/`;
        }
        path = `${path}${key}`;
        const keys: string[] = path.split('/');

        return Context.getValue<T>(keys, value);
    }

    /**
     * サービス名を取得します。
     *
     * @private
     * @param {string} suffix? サフィックス
     * @returns {string} サービス名
     * @memberof Context
     */
    public service(suffix?: string): string {
        let name = '';
        const code = this.get<string>('service_name');

        if (suffix) {
            name = `-${suffix}`;
        }

        return `${code}${name}`.toLowerCase();
    }
}
