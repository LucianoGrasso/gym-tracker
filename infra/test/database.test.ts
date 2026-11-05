import { App } from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildStack, synth } from './helpers';

describe('Database', () => {
  const template = synth();

  it('synthesizes without errors or pending AWS lookups (CI has no credentials)', () => {
    const stack = buildStack();
    Annotations.fromStack(stack).hasNoError('*', Match.anyValue());
    expect((stack.node.root as App).synth().manifest.missing ?? []).toEqual([]);
  });

  it('has no NAT gateways and no internet gateway', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    template.resourceCountIs('AWS::EC2::InternetGateway', 0);
  });

  it('runs Aurora Serverless v2 Postgres 17 that pauses at 0 ACU', () => {
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      EngineVersion: Match.stringLikeRegexp('^17\\.'),
      DatabaseName: 'gymtracker',
      MasterUsername: 'gymtracker',
      MasterUserPassword: { Ref: 'DbPassword' },
      StorageEncrypted: true,
      DeletionProtection: true,
      ServerlessV2ScalingConfiguration: { MinCapacity: 0, MaxCapacity: 2, SecondsUntilAutoPause: 600 },
    });
    template.hasResourceProperties('AWS::RDS::DBInstance', { DBInstanceClass: 'db.serverless' });
  });

  it('keeps secrets out of Secrets Manager and out of the template', () => {
    template.resourceCountIs('AWS::SecretsManager::Secret', 0);
    expect(template.toJSON().Parameters.AppKey).toMatchObject({ Type: 'String', NoEcho: true });
    expect(template.toJSON().Parameters.DbPassword).toMatchObject({ Type: 'String', NoEcho: true });
  });

  it('only lets the client security group reach Postgres', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      SourceSecurityGroupId: { 'Fn::GetAtt': [Match.stringLikeRegexp('DatabaseClientSg'), 'GroupId'] },
    });
  });
});
