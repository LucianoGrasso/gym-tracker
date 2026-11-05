import { Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { synth } from './helpers';
import { findCycle } from './no-cycles';

describe('Frontend', () => {
  const template = synth();

  it('serves the SPA from a private bucket through CloudFront', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  it('routes /api, /auth and /sanctum to the HTTP API without caching', () => {
    const distribution = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0] as {
      Properties: { DistributionConfig: { CacheBehaviors: { PathPattern: string; AllowedMethods: string[] }[] } };
    };
    const behaviors = distribution.Properties.DistributionConfig.CacheBehaviors;

    expect(behaviors.map((b) => b.PathPattern).sort()).toEqual(['/api/*', '/auth/*', '/sanctum/*']);
    behaviors.forEach((b) => expect(b.AllowedMethods).toContain('POST'));
  });

  it('rewrites SPA routes to index.html with a CloudFront Function, not with error responses', () => {
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp("r.uri = '/index.html'"),
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.absent(),
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
        }),
      }),
    });
  });

  it('tells Laravel its public URL so Sanctum treats the SPA as first-party', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gymtracker-http',
      Environment: {
        Variables: Match.objectLike({
          SANCTUM_STATEFUL_DOMAINS: { 'Fn::GetAtt': [Match.stringLikeRegexp('FrontendCdn'), 'DomainName'] },
          APP_URL: Match.anyValue(),
        }),
      },
    });
    template.hasOutput('Url', Match.anyValue());
    template.hasOutput('ArtisanFunction', Match.anyValue());
  });

  it('uploads the build twice: hashed assets cached for a year, the app shell never cached', () => {
    template.resourceCountIs('Custom::CDKBucketDeployment', 2);
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      SystemMetadata: { 'cache-control': 'public, max-age=31536000, immutable' },
    });
    template.hasResourceProperties('Custom::CDKBucketDeployment', {
      SystemMetadata: { 'cache-control': 'no-cache' },
      DistributionPaths: ['/*'],
    });
  });

  it('has no dependency cycles', () => {
    expect(findCycle(template.toJSON())).toBeNull();
  });
});
