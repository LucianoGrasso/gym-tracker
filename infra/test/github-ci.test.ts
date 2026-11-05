import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { GithubCiStack } from '../lib/github-ci-stack';

function synthCi(oidcProviderArn?: string): Template {
  const app = new App();
  const stack = new GithubCiStack(app, 'Ci', {
    env: { account: '123456789012', region: 'us-east-2' },
    githubSubjectPrefix: 'repo:LucianoGrasso@127354205/gym-tracker@1446923654',
    oidcProviderArn,
  });
  return Template.fromStack(stack);
}

describe('GithubCiStack', () => {
  it('lets only the main branch of the repo (immutable subject) assume the deploy role', () => {
    synthCi().hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'gymtracker-github-deploy',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': 'repo:LucianoGrasso@127354205/gym-tracker@1446923654:ref:refs/heads/main',
              },
            },
          }),
        ],
      },
    });
  });

  it('grants only CDK bootstrap roles, the prod secrets and the artisan function', () => {
    synthCi().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'sts:AssumeRole', Resource: Match.stringLikeRegexp('cdk-hnb659fds-') }),
          Match.objectLike({ Action: 'ssm:GetParameter', Resource: Match.stringLikeRegexp('parameter/gymtracker/prod/\\*') }),
          Match.objectLike({ Action: 'lambda:InvokeFunction', Resource: Match.stringLikeRegexp('function:gymtracker-artisan') }),
        ]),
      },
    });
  });

  it('creates the GitHub OIDC provider unless one already exists', () => {
    synthCi().resourceCountIs('AWS::IAM::OIDCProvider', 1);
    synthCi('arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com').resourceCountIs(
      'AWS::IAM::OIDCProvider',
      0,
    );
  });
});
