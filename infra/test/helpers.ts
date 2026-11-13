import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as path from 'node:path';
import { GymTrackerStack } from '../lib/gymtracker-stack';

export const WARM_UP = { minute: '12', hour: '12', weekDay: 'MON,TUE,THU,FRI' };

export function buildStack(): GymTrackerStack {
  const app = new App();
  const stack = new GymTrackerStack(app, 'Test', {
    env: { account: '123456789012', region: 'us-east-2' },
    backendPath: path.join(__dirname, 'fixtures/backend'),
    frontendPath: path.join(__dirname, 'fixtures/frontend'),
    warmUp: WARM_UP,
  });
  return stack;
}

export function synth(): Template {
  return Template.fromStack(buildStack());
}
