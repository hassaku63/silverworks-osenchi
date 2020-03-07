import * as cdk from '@aws-cdk/core';
import * as cloudtrail from '@aws-cdk/aws-cloudtrail';
import * as events from '@aws-cdk/aws-events';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as s3 from '@aws-cdk/aws-s3';
import * as targets from '@aws-cdk/aws-events-targets';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';

export interface IBucketProps {
    inputName: string;
    outputName: string;
    logName: string;
}

export interface ITopicProps {
    topicName: string;
    emails: string[];
}

export interface ICoreProps extends cdk.StackProps {
    bucket: IBucketProps;
    topic: ITopicProps;
    detectionFuncName: string;
    deletionFuncName: string;
}

export class CoreStack extends cdk.Stack {
    /** 入力バケット */
    readonly inputBucket: s3.Bucket;

    /** 出力バケット */
    readonly outputBucket: s3.Bucket;

    /** メールトピック */
    readonly emailTopic: sns.Topic;

    /** 感情検出Lambda関数 */
    readonly detectionFunc: lambda.Function;

    /** オブジェクト削除Lambda関数 */
    readonly deletionFunc: lambda.Function;

    /** ステートマシン */
    readonly stateMachine: sfn.StateMachine;

    /**
     * スタックのインスタンスを生成します。
     *
     * @param {cdk.Construct} scope
     * @param {string} id
     * @param {ICoreProps} [props]
     * @memberof CoreStack
     */
    constructor(scope: cdk.Construct, id: string, props?: ICoreProps) {
        super(scope, id, props);

        if (props) {
            // バケット
            [this.inputBucket, this.outputBucket] = this.newBuckets(props.bucket);

            // トピック
            this.emailTopic = this.newEmailTopic(props.topic);

            // Lambda関数
            this.detectionFunc = this.newDetectSentiment(props.detectionFuncName);
            this.deletionFunc = this.newDeleteObject(props.deletionFuncName);

            // ワークフロー
            this.stateMachine = this.newStateMachine();

            // イベントルール
            this.newEventRule();
        }
    }

    /**
     * バケットの生成
     *
     * @private
     * @param {IBucketProps} bucketProps バケット情報
     * @returns {[s3.Bucket, s3.Bucket]}
     * @memberof CoreStack
     */
    private newBuckets(bucketProps: IBucketProps): [s3.Bucket, s3.Bucket] {
        const inputBucket = new s3.Bucket(this, 'InputBucket', {
            bucketName: bucketProps.inputName,
        });

        const outputBucket = new s3.Bucket(this, 'OutputBucket', {
            bucketName: bucketProps.outputName,
        });

        const logBucket = new s3.Bucket(this, 'LogBucket', {
            bucketName: bucketProps.logName,
        });

        const trail = new cloudtrail.Trail(this, 'Trail', {
            bucket: logBucket,
            isMultiRegionTrail: false,
        });
        trail.addS3EventSelector([`arn:aws:s3:::${inputBucket.bucketName}/`], {
            readWriteType: cloudtrail.ReadWriteType.WRITE_ONLY,
        });

        return [inputBucket, outputBucket];
    }

    /**
     * メールトピックの生成
     *
     * @private
     * @param {ITopicProps} topicProps トピック情報
     * @returns {sns.Topic}
     * @memberof CoreStack
     */
    private newEmailTopic(topicProps: ITopicProps): sns.Topic {
        const topic = new sns.Topic(this, 'Topic', {
            topicName: topicProps.topicName,
        });
        for (const email of topicProps.emails) {
            this.validateEmail(email);
            topic.addSubscription(new subscriptions.EmailSubscription(email));
        }
        return topic;
    }

    /**
     * メールアドレスを検証
     *
     * @param {string} email メールアドレス
     */
    private validateEmail(email: string): void {
        const regexp = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

        if (!email.match(regexp)) {
            throw new Error('Email parameter is invalid.');
        }
    }

    /**
     * 感情検出Lambda関数の生成
     *
     * @private
     * @param {string} functionName 関数名
     * @returns {lambda.Function}
     * @memberof CoreStack
     */
    private newDetectSentiment(functionName: string): lambda.Function {
        const func = new lambda.Function(this, 'DetectionFunc', {
            functionName: functionName,
            code: lambda.Code.fromAsset('functions/detect-sentiment', {
                exclude: ['*.ts'],
            }),
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_12_X,
            timeout: cdk.Duration.minutes(5),
            environment: {
                DEST_BUCKET: this.outputBucket.bucketName,
            },
        });
        this.inputBucket.grantRead(func);
        this.outputBucket.grantWrite(func);

        const policy = new iam.PolicyStatement({
            resources: ['*'],
            actions: ['comprehend:BatchDetectSentiment'],
        });
        func.addToRolePolicy(policy);

        return func;
    }

    /**
     * オブジェクト削除Lambda関数の生成
     *
     * @private
     * @param {string} functionName 関数名
     * @returns {lambda.Function}
     * @memberof CoreStack
     */
    private newDeleteObject(functionName: string): lambda.Function {
        const func = new lambda.Function(this, 'DeletionFunc', {
            functionName: functionName,
            code: lambda.Code.fromAsset('functions/delete-object', {
                exclude: ['*.ts'],
            }),
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_12_X,
        });
        this.inputBucket.grantDelete(func);

        return func;
    }

    /**
     * ステートマシンの生成
     *
     * @private
     * @returns {sfn.StateMachine}
     * @memberof CoreStack
     */
    private newStateMachine(): sfn.StateMachine {
        const sentimentTask = new sfn.Task(this, 'DetectSentiment', {
            task: new tasks.InvokeFunction(this.detectionFunc),
        });
        const deleteTask = new sfn.Task(this, 'DeleteObject', {
            task: new tasks.InvokeFunction(this.deletionFunc),
        });
        const successTask = new sfn.Task(this, 'SendSuccessMail', {
            task: new tasks.PublishToTopic(this.emailTopic, {
                subject: `Osenchi Success`,
                message: sfn.TaskInput.fromDataAt('$.*'),
            }),
        });

        const errorTask = new sfn.Task(this, 'SendErrorMail', {
            task: new tasks.PublishToTopic(this.emailTopic, {
                subject: `Osenchi Error`,
                message: sfn.TaskInput.fromDataAt('$.*'),
            }),
        });

        const fail = new sfn.Fail(this, 'Fail');
        errorTask.next(fail);

        const mainFlow = sentimentTask.next(deleteTask).next(successTask);

        const parallel = new sfn.Parallel(this, 'Parallel');
        parallel.branch(mainFlow);
        parallel.addCatch(errorTask, { resultPath: '$.error' });

        const stateMachine = new sfn.StateMachine(this, 'CoreStateMachine', {
            definition: parallel,
            timeout: cdk.Duration.minutes(30),
        });

        this.emailTopic.grantPublish(stateMachine.role);

        return stateMachine;
    }

    /**
     * イベントルールの生成
     *
     * @private
     * @returns {events.Rule}
     * @memberof CoreStack
     */
    private newEventRule(): events.Rule {
        const rule = new events.Rule(this, 'EventRule', {
            eventPattern: {
                source: ['aws.s3'],
                detailType: ['AWS API Call via CloudTrail'],
                detail: {
                    eventSource: ['s3.amazonaws.com'],
                    eventName: ['PutObject'],
                    requestParameters: {
                        bucketName: [this.inputBucket.bucketName],
                    },
                },
            },
        });

        const target = new targets.SfnStateMachine(this.stateMachine);
        rule.addTarget(target);

        return rule;
    }
}
