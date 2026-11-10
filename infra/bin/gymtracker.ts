import { App } from 'aws-cdk-lib';
import * as path from 'node:path';
import { GithubCiStack } from '../lib/github-ci-stack';
import { GymTrackerStack, type WarmUpSchedule } from '../lib/gymtracker-stack';

const app = new App();
// La cuenta sale de las credenciales al desplegar (la CLI define CDK_DEFAULT_ACCOUNT; en CI, el rol OIDC):
// así el ID de la cuenta no queda en el repo público.
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: app.node.getContext('region') as string };

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
  githubSubjectPrefix: app.node.getContext('githubSubjectPrefix') as string,
  oidcProviderArn: app.node.tryGetContext('githubOidcProviderArn') as string | undefined,
});
