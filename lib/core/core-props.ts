import * as cdk from '@aws-cdk/core';
import { Context } from '../common/context';
import { ICoreProps } from './core-stack';

export class CoreProps {
    public static fromContext(node: cdk.ConstructNode): ICoreProps {
        const context = new Context(node);

        return {
            bucket: {
                inputName: context.service('input'),
                outputName: context.service('output'),
                logName: context.service('log'),
            },
            topic: {
                topicName: context.service('topic'),
                emails: context.get<string>('emails').split(','),
            },
            detectionFuncName: context.service('detect-sentiment'),
            deletionFuncName: context.service('delete-object'),
        };
    }
}
