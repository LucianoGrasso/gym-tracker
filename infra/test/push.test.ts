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
          STATE_MACHINE_ARN: Match.anyValue(),
          VAPID_SUBJECT: Match.anyValue(),
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

  it('times the rest with a Standard state machine: wait, warm the push function, wait, send', () => {
    template.resourceCountIs('AWS::Scheduler::ScheduleGroup', 0);
    const machines = template.findResources('AWS::StepFunctions::StateMachine', {
      Properties: { StateMachineName: 'gymtracker-rest', StateMachineType: 'STANDARD' },
    });
    expect(Object.keys(machines)).toHaveLength(1);

    const definition = JSON.stringify(Object.values(machines)[0]);
    expect(definition).toContain('\\"TimestampPath\\":\\"$.warmAt\\"');
    expect(definition).toContain('\\"TimestampPath\\":\\"$.sendAt\\"');
    expect(definition).toContain('\\"kind\\":\\"warm\\"');
    // Si el calentamiento falla, igual se espera y se envía.
    expect(definition).toMatch(/\\"Catch\\":\[\{\\"ErrorEquals\\":\[\\"States.ALL\\"\],\\"ResultPath\\":null,\\"Next\\":\\"WaitSend\\"/);
    expect(definition).toContain('\\"kind\\":\\"send\\"');
    expect(definition).toMatch(/PushFunction[0-9A-F]+/);
  });

  it('can only start the rest machine and stop its executions', () => {
    const startExecution = statementWith('states:StartExecution');
    expect(JSON.stringify(startExecution?.Resource)).toContain(':stateMachine:gymtracker-rest');
    const stopExecution = statementWith('states:StopExecution');
    expect(JSON.stringify(stopExecution?.Resource)).toContain(':execution:gymtracker-rest:*');
    expect(statementWith('scheduler:CreateSchedule')).toBeUndefined();
    expect(statementWith('iam:PassRole')).toBeUndefined();
  });

  it('exposes POST /push/* on the HTTP API', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'POST /push/{proxy+}' });
  });
});
