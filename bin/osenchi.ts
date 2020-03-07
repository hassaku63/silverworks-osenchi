#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { Context } from '../lib/common/context';
import { CoreProps } from '../lib/core/core-props';
import { CoreStack } from '../lib/core/core-stack';

if (Boolean(process.env.DEBUG)) {
    Context.setEnvironment();
}

const app = new cdk.App();
const props = CoreProps.fromContext(app.node);
new CoreStack(app, 'Osenchi-Core', props);
