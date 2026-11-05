import { App } from 'aws-cdk-lib';
import * as path from 'node:path';
import { GithubCiStack } from '../lib/github-ci-stack';
import { GymTrackerStack, type WarmUpSchedule } from '../lib/gymtracker-stack';

const app = new App();
const env = { account: app.node.getContext('account') as string, region: app.node.getContext('region') as string };

new GymTrackerStack(app, 'GymTrackerStack', {
  env,
  description: 'GymTracker: CloudFront + S3, API Gateway + Lambda (Bref), Aurora Serverless v2',
  backendPath: path.join(__dirname, '../../backend'),
  frontendPath: path.join(__dirname, '../../frontend/dist/frontend/browser'),
  warmUp: app.node.getContext('warmUp') as WarmUpSchedule,
});

new GithubCiStack(app, 'GymTrackerCiStack', {
  env,
  description: 'GymTracker: rol OIDC para desplegar desde GitHub Actions',
  githubRepo: app.node.getContext('githubRepo') as string,
  oidcProviderArn: app.node.tryGetContext('githubOidcProviderArn') as string | undefined,
});
