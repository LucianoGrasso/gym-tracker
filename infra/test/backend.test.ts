import { Match } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';
import { synth } from './helpers';

describe('Backend', () => {
  const template = synth();

  const sharedEnv = {
    APP_ENV: 'production',
    APP_DEBUG: 'false',
    APP_KEY: { Ref: 'AppKey' },
    LOG_CHANNEL: 'stderr',
    DB_CONNECTION: 'pgsql',
    DB_HOST: { 'Fn::GetAtt': [Match.stringLikeRegexp('DatabaseCluster'), 'Endpoint.Address'] },
    DB_DATABASE: 'gymtracker',
    DB_USERNAME: 'gymtracker',
    DB_PASSWORD: { Ref: 'DbPassword' },
    DB_SSLMODE: 'require',
    SESSION_DRIVER: 'database',
    SESSION_SECURE_COOKIE: 'true',
    CACHE_STORE: 'database',
  };

  it('runs Laravel over PHP-FPM inside the isolated subnets', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-http',
      Handler: 'public/index.php',
      Runtime: 'provided.al2023',
      Timeout: 28,
      VpcConfig: Match.objectLike({ SecurityGroupIds: Match.anyValue(), SubnetIds: Match.anyValue() }),
      Environment: { Variables: Match.objectLike({ ...sharedEnv, BREF_RUNTIME: 'fpm' }) },
    });
  });

  it('has a console function for artisan with a longer timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-artisan',
      Handler: 'artisan',
      Timeout: 120,
      Environment: { Variables: Match.objectLike({ ...sharedEnv, BREF_RUNTIME: 'console' }) },
    });
  });

  it('exposes the HTTP function through an HTTP API', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: '$default' });
  });

  it('wakes Aurora up before training (Mon, Tue, Thu, Fri 18:45 Santiago)', () => {
    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(45 18 ? * MON,TUE,THU,FRI *)',
      ScheduleExpressionTimezone: 'America/Santiago',
      Target: Match.objectLike({
        Arn: { 'Fn::GetAtt': [Match.stringLikeRegexp('BackendArtisan'), 'Arn'] },
        Input: '"app:wake-db"',
      }),
    });
  });

  it('keeps logs for a month', () => {
    template.allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });
});
