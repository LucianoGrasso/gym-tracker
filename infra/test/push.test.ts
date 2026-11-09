import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { synth } from './helpers';

type Statement = { Action: string | string[]; Resource: unknown };

describe('Push', () => {
  const template = synth();
  const statements = (): Statement[] =>
    Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
      (p) => (p as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement,
    );
  const statementWith = (action: string) =>
    statements().find((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]).includes(action));

  it('runs on Node 22 outside the VPC (it needs internet, not Aurora)', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-push',
      Runtime: 'nodejs22.x',
      VpcConfig: Match.absent(),
      Environment: {
        Variables: Match.objectLike({
          PUSH_SIGNING_KEY: { Ref: 'PushSigningKey' },
          VAPID_PRIVATE_KEY: { Ref: 'VapidPrivateKey' },
          VAPID_PUBLIC_KEY: { Ref: 'VapidPublicKey' },
          SCHEDULE_GROUP: 'gymtracker-rest',
          VAPID_SUBJECT: Match.anyValue(),
          SCHEDULER_ROLE_ARN: Match.anyValue(),
          TARGET_ARN: Match.anyValue(),
        }),
      },
    });
  });

  it('keeps the push secrets out of the template', () => {
    template.hasParameter('PushSigningKey', { NoEcho: true });
    template.hasParameter('VapidPrivateKey', { NoEcho: true });
    template.hasParameter('VapidPublicKey', Match.objectLike({ Type: 'String' }));
  });

  it('gives Laravel the signing key and the public key', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-http',
      Environment: {
        Variables: Match.objectLike({
          PUSH_SIGNING_KEY: { Ref: 'PushSigningKey' },
          PUSH_VAPID_PUBLIC_KEY: { Ref: 'VapidPublicKey' },
        }),
      },
    });
  });

  it('creates the schedule group and can only manage schedules inside it', () => {
    template.hasResourceProperties('AWS::Scheduler::ScheduleGroup', { Name: 'gymtracker-rest' });

    const manage = statementWith('scheduler:CreateSchedule');
    expect(manage?.Action).toEqual([
      'scheduler:CreateSchedule',
      'scheduler:UpdateSchedule',
      'scheduler:DeleteSchedule',
    ]);
    expect(JSON.stringify(manage?.Resource)).toContain(':schedule/gymtracker-rest/*');
    expect(statementWith('iam:PassRole')).toBeDefined();
  });

  it('lets Scheduler invoke only the push function', () => {
    const invoke = statements().filter((s) => s.Action === 'lambda:InvokeFunction');
    expect(invoke.some((s) => JSON.stringify(s.Resource).includes('function:gymtracker-push'))).toBe(true);
  });

  it('exposes POST /push/* on the HTTP API', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'POST /push/{proxy+}' });
  });
});
